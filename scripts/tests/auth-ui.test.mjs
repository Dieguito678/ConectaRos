import { before, after, afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import React from 'react'

let dom,server,render,screen,within,fireEvent,waitFor,cleanup,act,AuthProvider,AuthDialog,AuthHeader,MyClaimsAccess,createAuthStore,SiteHeader
before(async () => {
  dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost:5173/'})
  for (const name of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLDialogElement','MutationObserver','FormData']) {
    Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true,writable:true})
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT=true
  globalThis.requestAnimationFrame=callback=>setTimeout(()=>callback(0),0)
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')}
  dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
  ;({render,screen,within,fireEvent,waitFor,cleanup,act}=await import('@testing-library/react'))
  server=await createServer({envDir:false,server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}})
  ;({AuthProvider}=await server.ssrLoadModule('/src/auth/AuthProvider.tsx'))
  ;({AuthDialog}=await server.ssrLoadModule('/src/auth/AuthDialog.tsx'))
  ;({AuthHeader}=await server.ssrLoadModule('/src/auth/AuthHeader.tsx'))
  ;({SiteHeader}=await server.ssrLoadModule('/src/components/SiteHeader.tsx'))
  ;({MyClaims:MyClaimsAccess}=await server.ssrLoadModule('/src/claims/MyClaims.tsx'))
  ;({createAuthStore}=await server.ssrLoadModule('/src/auth/auth-store.ts'))
})
afterEach(()=>cleanup())
after(async()=>{await server?.close();dom?.window.close()})

function setupClient(signup, signin) {
  let callback;const calls=[]
  const client={calls,emit(event,value){callback?.(event,value)},auth:{
    onAuthStateChange(fn){callback=fn;return {data:{subscription:{unsubscribe(){callback=null}}}}},
    async getSession(){return {data:{session:null},error:null}},
    async signUp(payload){calls.push(payload);return signup?signup():{data:{user:{id:'test'},session:null},error:null}},
    async signInWithPassword(payload){calls.push(payload);return signin?signin():{data:{session:null},error:{code:'invalid_credentials'}}},
    async signOut(){callback?.('SIGNED_OUT',null);return {error:null}},
  },from(table){let userId;const chain={select(){return chain},eq(_key,value){userId=value;return chain},abortSignal(){return chain},
    async single(){return {data:{id:userId,display_name:'Cuenta local'},error:null}},async returns(){return {data:[],error:null}}};return chain}}
  return client
}
async function renderDialog(mode='signup',client=setupClient()) {
  const store=createAuthStore(client,'http://localhost:5173')
  let closed=0
  render(React.createElement(AuthProvider,{store},React.createElement(AuthDialog,{mode,onClose:()=>{closed++},onSwitch:()=>{}})))
  await waitFor(()=>assert.equal(store.getSnapshot().loading,false))
  return {client,store,get closed(){return closed}}
}
function fillSignup() {
  fireEvent.change(screen.getByLabelText('Nombre visible'),{target:{value:'Vecina de prueba'}})
  fireEvent.change(screen.getByLabelText('Correo electrónico'),{target:{value:'vecina@example.invalid'}})
  fireEvent.change(screen.getByLabelText('Contraseña',{exact:true}),{target:{value:'Only-test-123'}})
  fireEvent.change(screen.getByLabelText('Repetir contraseña'),{target:{value:'Only-test-123'}})
}
test('accessible form validation focuses invalid name and never contacts Auth',async()=>{
  const {client}=await renderDialog()
  fireEvent.click(screen.getByRole('button',{name:'Crear cuenta',exact:true}))
  assert.match(screen.getByText(/Ingresá un nombre de 1 a 80/).textContent,/nombre/)
  assert.ok(document.activeElement===screen.getByLabelText('Nombre visible'),'validation focuses the visible name input')
  assert.equal(screen.getByLabelText('Correo electrónico').getAttribute('aria-invalid'),'true')
  assert.equal(client.calls.length,0)
})
test('signup disables submission, clears passwords and reports pending confirmation without authentication',async()=>{
  let resolve
  const pending=new Promise(r=>{resolve=r})
  const {store,client}=await renderDialog('signup',setupClient(()=>pending))
  fillSignup();fireEvent.click(screen.getByRole('button',{name:'Crear cuenta',exact:true}))
  assert.equal(screen.getByRole('button',{name:'Procesando…'}).matches(':disabled'),true)
  assert.equal(screen.getByLabelText('Correo electrónico').matches(':disabled'),true)
  await act(async()=>{resolve({data:{user:{id:'ambiguous'},session:null},error:null});await pending})
  assert.ok(await screen.findByText('Revisá tu correo para confirmar tu cuenta'))
  assert.ok(screen.getByText(/Para cuidar tu privacidad/))
  assert.equal(screen.getByLabelText('Contraseña',{exact:true}).value,'')
  assert.equal(screen.getByLabelText('Repetir contraseña').value,'')
  assert.equal(store.getSnapshot().session,null)
  assert.deepEqual(Object.keys(client.calls[0].options.data),['display_name'])
  assert.equal(screen.queryByLabelText(/rol/i),null)
})
test('login toggles password visibility and shows wrong-credential error in Spanish',async()=>{
  await renderDialog('login')
  const password=screen.getByLabelText('Contraseña',{exact:true})
  fireEvent.change(screen.getByLabelText('Correo electrónico'),{target:{value:'vecina@example.invalid'}})
  fireEvent.change(password,{target:{value:'Only-test-123'}})
  assert.equal(password.type,'password')
  fireEvent.click(screen.getByRole('button',{name:'Mostrar contraseña'}));assert.equal(password.type,'text')
  fireEvent.click(screen.getByRole('button',{name:'Ocultar contraseña'}));assert.equal(password.type,'password')
  fireEvent.click(screen.getByRole('button',{name:'Ingresar',exact:true}))
  assert.match((await screen.findByRole('alert')).textContent,/incorrectos/)
  assert.equal(password.value,'')
})
test('Mis reclamos asks for access, then shows a real empty query without fake claims',async()=>{
  const client=setupClient(),store=createAuthStore(client,'http://localhost:5173')
  const repository={list:async()=>({rows:[],more:false})}
  const view=render(React.createElement(AuthProvider,{store},React.createElement(MyClaimsAccess,{onOpen:()=>{},onCreate:()=>{},onDetail:()=>{},refresh:0,repository})))
  assert.ok(await screen.findByText('Ingresá para acceder a tu espacio'))
  await act(async()=>{client.emit('SIGNED_IN',{user:{id:'account-A'}});await new Promise(r=>setTimeout(r,10))})
  assert.ok(screen.getByText('Todavía no creaste ningún reclamo.'))
  assert.ok(screen.getByRole('button',{name:'Crear mi primer reclamo'}))
  assert.equal(screen.queryByRole('button',{name:'Publicar reclamo'}),null)
  view.unmount()
})
test('header shows name from own profile and replaces it after logout',async()=>{
  const client=setupClient(),store=createAuthStore(client,'http://localhost:5173')
  render(React.createElement(AuthProvider,{store},React.createElement(AuthHeader,{onOpen:()=>{}})))
  assert.ok(await screen.findByRole('button',{name:'Ingresar'}))
  await act(async()=>{client.emit('SIGNED_IN',{user:{id:'account-A',user_metadata:{display_name:'Untrusted metadata'}}});await new Promise(r=>setTimeout(r,10))})
  assert.ok(screen.getByText('Cuenta local'));assert.equal(screen.queryByText('Untrusted metadata'),null)
  const account=screen.getByRole('button',{name:/^Cuenta de /})
  fireEvent.keyDown(account,{key:'ArrowDown'})
  assert.ok(document.activeElement===screen.getByRole('menuitem',{name:'Cerrar sesión'}),'opening the account menu focuses logout')
  fireEvent.keyDown(document.activeElement,{key:'Escape'})
  assert.equal(screen.queryByRole('menuitem',{name:'Cerrar sesión'}),null)
  assert.ok(document.activeElement===account,'Escape returns focus to the account trigger')
  fireEvent.click(account); fireEvent.click(screen.getByRole('menuitem',{name:'Cerrar sesión'}))
  assert.ok(await screen.findByRole('button',{name:'Ingresar'}));assert.equal(screen.queryByText('Cuenta local'),null)
})
test('compact navigation opens with focus, closes with Escape and calls real sections',async()=>{
  const store=createAuthStore(setupClient(),'http://localhost:5173');let selected=null,created=0
  render(React.createElement(AuthProvider,{store},React.createElement(SiteHeader,{section:'Mi barrio',onSection:value=>selected=value,onCreate:()=>created++,onAuth:()=>{},createDisabled:false})))
  const toggle=screen.getByRole('button',{name:'Abrir menú'})
  fireEvent.click(toggle)
  const nav=within(screen.getByRole('navigation',{name:'Navegación principal'}))
  await waitFor(()=>assert.ok(document.activeElement===nav.getByRole('button',{name:'Mi barrio'}),'opening mobile navigation focuses the active section'))
  assert.equal(toggle.getAttribute('aria-expanded'),'true')
  fireEvent.keyDown(document.activeElement,{key:'Escape'})
  assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.ok(document.activeElement===toggle,'Escape returns focus to mobile navigation trigger')
  fireEvent.click(toggle);fireEvent.click(nav.getByRole('button',{name:'Mis reclamos'}))
  assert.equal(selected,'Mis reclamos');assert.equal(toggle.getAttribute('aria-expanded'),'false')
  fireEvent.click(screen.getByRole('button',{name:'Crear reclamo'}));assert.equal(created,1)
})

test('closing and unmounting an auth dialog returns focus to its connected opener',async()=>{
  const store=createAuthStore(setupClient(),'http://localhost:5173')
  function DialogHarness(){
    const [open,setOpen]=React.useState(false)
    return React.createElement(React.Fragment,null,
      React.createElement('button',{type:'button',onClick:()=>setOpen(true)},'Abrir acceso de prueba'),
      open?React.createElement(AuthDialog,{mode:'login',onClose:()=>setOpen(false),onDismiss:()=>setOpen(false),onSwitch:()=>{}}):null,
    )
  }
  render(React.createElement(AuthProvider,{store},React.createElement(DialogHarness)))
  await waitFor(()=>assert.equal(store.getSnapshot().loading,false))
  const opener=screen.getByRole('button',{name:'Abrir acceso de prueba'})
  opener.getClientRects=()=>[{x:0,y:0,width:44,height:44,top:0,right:44,bottom:44,left:0,toJSON(){return{}}}]
  opener.focus()
  fireEvent.click(opener)
  const dialog=await screen.findByRole('dialog',{name:'Volvé a conectar'})
  const email=screen.getByLabelText('Correo electrónico')
  email.focus()
  assert.ok(document.activeElement===email,'focus moves inside the open dialog')
  // JSDOM does not implement native Escape->cancel, so dispatch its resulting event.
  fireEvent(dialog,new dom.window.Event('cancel',{cancelable:true}))
  await waitFor(()=>assert.equal(screen.queryByRole('dialog'),null))
  assert.ok(document.activeElement===opener,'unmount cleanup restores focus to the connected opener')
})

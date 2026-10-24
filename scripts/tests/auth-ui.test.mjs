import { before, after, afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import React from 'react'

let dom,server,render,screen,within,fireEvent,waitFor,cleanup,act,AuthProvider,AuthDialog,AuthHeader,MyClaimsAccess,createAuthStore
before(async () => {
  dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost:5173/'})
  for (const name of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLDialogElement','MutationObserver','FormData']) {
    Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true,writable:true})
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT=true
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')}
  dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
  ;({render,screen,within,fireEvent,waitFor,cleanup,act}=await import('@testing-library/react'))
  server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}})
  ;({AuthProvider}=await server.ssrLoadModule('/src/auth/AuthProvider.tsx'))
  ;({AuthDialog}=await server.ssrLoadModule('/src/auth/AuthDialog.tsx'))
  ;({AuthHeader}=await server.ssrLoadModule('/src/auth/AuthHeader.tsx'))
  ;({MyClaimsAccess}=await server.ssrLoadModule('/src/auth/MyClaimsAccess.tsx'))
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
  assert.equal(document.activeElement,screen.getByLabelText('Nombre visible'))
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
  assert.ok(screen.getByText(/La respuesta no confirma si se creó una cuenta nueva/))
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
test('Mis reclamos asks for access, then shows pending personal module without fake claims',async()=>{
  const client=setupClient(),store=createAuthStore(client,'http://localhost:5173')
  const view=render(React.createElement(AuthProvider,{store},React.createElement(MyClaimsAccess,{onOpen:()=>{},onExplore:()=>{}})))
  assert.ok(await screen.findByText('Ingresá para acceder a tu espacio'))
  await act(async()=>{client.emit('SIGNED_IN',{user:{id:'account-A'}});await new Promise(r=>setTimeout(r,10))})
  assert.ok(screen.getByText('Tu sesión está activa'))
  assert.ok(screen.getByText(/El módulo de reclamos personales está pendiente/))
  assert.equal(screen.queryByRole('button',{name:'Publicar reclamo'}),null)
  view.unmount()
})
test('header shows name from own profile and replaces it after logout',async()=>{
  const client=setupClient(),store=createAuthStore(client,'http://localhost:5173')
  render(React.createElement(AuthProvider,{store},React.createElement(AuthHeader,{onOpen:()=>{}})))
  assert.ok(await screen.findByRole('button',{name:'Ingresar'}))
  await act(async()=>{client.emit('SIGNED_IN',{user:{id:'account-A',user_metadata:{display_name:'Untrusted metadata'}}});await new Promise(r=>setTimeout(r,10))})
  assert.ok(screen.getByText('Cuenta local'));assert.equal(screen.queryByText('Untrusted metadata'),null)
  fireEvent.click(screen.getByRole('button',{name:'Cerrar sesión'}))
  assert.ok(await screen.findByRole('button',{name:'Ingresar'}));assert.equal(screen.queryByText('Cuenta local'),null)
})

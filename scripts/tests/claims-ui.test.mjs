import {before,after,afterEach,test} from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {createServer} from 'vite'
import React from 'react'
let dom,server,render,screen,fireEvent,waitFor,cleanup,act,within,AuthProvider,createAuthStore,CreateClaimDialog,MyClaims,App
before(async()=>{
  dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost:5173/'})
  for(const name of ['window','document','navigator','HTMLElement','HTMLInputElement','HTMLDialogElement','MutationObserver','FormData'])Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true,writable:true})
  globalThis.IS_REACT_ACT_ENVIRONMENT=true
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')}
  dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
  ;({render,screen,fireEvent,waitFor,cleanup,act,within}=await import('@testing-library/react'))
  server=await createServer({envDir:false,server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}})
  ;({AuthProvider}=await server.ssrLoadModule('/src/auth/AuthProvider.tsx'))
  ;({createAuthStore}=await server.ssrLoadModule('/src/auth/auth-store.ts'))
  ;({CreateClaimDialog}=await server.ssrLoadModule('/src/claims/CreateClaimDialog.tsx'))
  ;({MyClaims}=await server.ssrLoadModule('/src/claims/MyClaims.tsx'))
  ;({default:App}=await server.ssrLoadModule('/src/App.tsx'))
})
afterEach(()=>cleanup())
after(async()=>{await server?.close();dom?.window.close()})
const category={id:'10000000-0000-4000-8000-000000000001',name:'Alumbrado',slug:'alumbrado'}
const claim={id:'23000000-0000-4000-8000-000000000001',author_id:'A',title:'Reclamo propio A',description:'Descripción de prueba',address:'Prueba 123',neighborhood:'Centro',status:'publicado',moderation_status:'pendiente',is_demo:true,created_at:'2026-10-24T12:00:00Z',category}
function auth(initial='A') {
  let callback
  const session=id=>id?{user:{id}}:null
  const client={auth:{
    async getSession(){return{data:{session:session(initial)},error:null}},
    onAuthStateChange(fn){callback=fn;return{data:{subscription:{unsubscribe(){callback=null}}}}},
    async signInWithPassword(){callback?.('SIGNED_IN',session('A'));return{data:{session:session('A')},error:null}},
    async signOut(){callback?.('SIGNED_OUT',null);return{error:null}},
  },from(table){let id;const chain={select(){return chain},eq(_key,value){id=value;return chain},abortSignal(){return chain},async single(){return{data:{id,display_name:`Cuenta ${id}`},error:null}},async returns(){return{data:[],error:null}}};return chain}}
  return{store:createAuthStore(client,'http://localhost:5173'),emit:(event,id)=>callback?.(event,session(id))}
}
function repo(overrides={}){return{categories:async()=>[category],submit:async(id)=>id,attach:async()=>{},list:async()=>({rows:[],more:false}),...overrides}}
async function compose(repository=repo(),strict=false){
  const context=auth();let closed=0,saved=0
  const node=React.createElement(AuthProvider,{store:context.store},React.createElement(CreateClaimDialog,{userId:'A',repository,onClose:()=>closed++,onSaved:()=>saved++,onView:()=>{}}))
  const view=render(strict?React.createElement(React.StrictMode,null,node):node)
  await screen.findByRole('option',{name:'Alumbrado público'})
  return{...context,view,get closed(){return closed},get saved(){return saved}}
}
function fill(){
  for(const [label,value] of [['Título','Luminaria de prueba'],['Descripción','Descripción ficticia de prueba'],['Dirección o referencia','Prueba 123'],['Barrio','Centro']])fireEvent.change(screen.getByLabelText(label),{target:{value}})
  fireEvent.change(screen.getByLabelText('Categoría'),{target:{value:category.id}})
}
test('claim form has labels, validates without submission and focuses first error',async()=>{
  let sent=0;await compose(repo({submit:async()=>sent++}))
  fireEvent.click(screen.getByRole('button',{name:'Enviar para revisión'}))
  assert.equal(screen.getByLabelText('Título').getAttribute('aria-invalid'),'true')
  assert.equal(document.activeElement,screen.getByLabelText('Título'));assert.equal(sent,0)
  assert.ok(screen.getByText(/No incluyas datos sensibles/))
})
test('creation works in StrictMode, blocks double submit and reports pending review',async()=>{
  let sent=0,release;const pending=new Promise(r=>release=r)
  const context=await compose(repo({submit:async(id)=>{sent++;await pending;return id}}),true)
  fill();fireEvent.click(screen.getByRole('button',{name:'Enviar para revisión'}))
  assert.equal(screen.getByRole('button',{name:'Guardando reclamo…'}).matches(':disabled'),true)
  fireEvent.submit(document.querySelector('form'));assert.equal(sent,1)
  await act(async()=>{release();await pending})
  assert.ok(await screen.findByRole('heading',{name:'Reclamo enviado para revisión'}))
  assert.ok(screen.getByText('Todavía no aparece en el listado público.'));assert.equal(context.saved,1)
})
test('dirty cancel asks for confirmation and keeps values until explicitly discarded',async()=>{
  const context=await compose();fill()
  fireEvent.click(screen.getByRole('button',{name:'Cerrar creación de reclamo'}))
  assert.ok(screen.getByText('¿Cerrar este formulario?'));assert.equal(context.closed,0)
  fireEvent.click(screen.getByRole('button',{name:'Seguir acá'}))
  assert.equal(screen.getByLabelText('Título').value,'Luminaria de prueba')
  fireEvent.click(screen.getByRole('button',{name:'Cerrar creación de reclamo'}))
  fireEvent.click(screen.getByRole('button',{name:'Cerrar formulario',exact:true}));assert.equal(context.closed,1)
})
test('photo failure keeps saved claim, retries only photo and revokes preview URLs',async()=>{
  let created=0,attachments=0,revoked=0
  const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL
  URL.createObjectURL=()=> 'blob:test-photo';URL.revokeObjectURL=()=>revoked++
  try{
    await compose(repo({submit:async(id)=>{created++;return id},attach:async()=>{attachments++;if(attachments===1)throw new Error('network')}}))
    fill()
    const file=new File([new Uint8Array([255,216,255,0])],'original.jpg',{type:'image/jpeg'})
    fireEvent.change(screen.getByLabelText('Fotografía opcional'),{target:{files:[file]}})
    await screen.findByAltText('Vista previa de la fotografía seleccionada')
    fireEvent.click(screen.getByRole('button',{name:'Enviar para revisión'}))
    assert.ok(await screen.findByRole('button',{name:'Reintentar solo la imagen'}))
    assert.equal(created,1);assert.equal(revoked,1)
    fireEvent.click(screen.getByRole('button',{name:'Reintentar solo la imagen'}))
    await waitFor(()=>assert.equal(screen.queryByRole('button',{name:'Reintentar solo la imagen'}),null))
    assert.equal(created,1);assert.equal(attachments,2)
  }finally{URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke}
})
test('own list handles loading, empty, error and retry',async()=>{
  const context=auth();let fail=true,release
  const pending=new Promise(r=>release=r)
  const repository=repo({list:async()=>{await pending;if(fail)throw new Error('network');return{rows:[],more:false}}})
  render(React.createElement(AuthProvider,{store:context.store},React.createElement(MyClaims,{repository,refresh:0,onOpen:()=>{},onCreate:()=>{},onDetail:()=>{}})))
  assert.ok(await screen.findByText('Cargando tus reclamos…'))
  await act(async()=>{release();await pending})
  assert.match((await screen.findByRole('alert')).textContent,/No pudimos cargar/)
  fail=false;fireEvent.click(screen.getByRole('button',{name:'Reintentar mis reclamos'}))
  assert.ok(await screen.findByRole('button',{name:'Crear mi primer reclamo'}))
})
test('own list clears account A on change/logout, ignoring late A responses',async()=>{
  const context=auth();let release
  const pending=new Promise(r=>release=r)
  const repository=repo({list:async(scope)=>scope.userId==='A'?pending:{rows:[{...claim,id:'B-claim',author_id:'B',title:'Reclamo propio B'}],more:false}})
  render(React.createElement(AuthProvider,{store:context.store},React.createElement(MyClaims,{repository,refresh:0,onOpen:()=>{},onCreate:()=>{},onDetail:()=>{}})))
  await screen.findByText('Cargando tus reclamos…')
  await act(async()=>{context.emit('SIGNED_IN','B')})
  assert.ok(await screen.findByText('Reclamo propio B'))
  await act(async()=>{release({rows:[claim],more:false});await pending})
  assert.equal(screen.queryByText('Reclamo propio A'),null)
  assert.ok(screen.getByText('En revisión',{exact:true}))
  await act(async()=>context.emit('SIGNED_OUT',null))
  assert.equal(screen.queryByText('Reclamo propio B'),null);assert.ok(screen.getByText('Ingresá para acceder a tu espacio'))
})
test('anonymous create hands off to Auth, cancel does not reopen, login resumes the intent',async()=>{
  const context=auth(null),repository=repo()
  render(React.createElement(AuthProvider,{store:context.store},React.createElement(App,{claimsRepository:repository})))
  await waitFor(()=>assert.equal(screen.getAllByRole('button',{name:'Crear reclamo',exact:true})[0].disabled,false))
  fireEvent.click(screen.getAllByRole('button',{name:'Crear reclamo',exact:true})[0])
  assert.ok(await screen.findByRole('heading',{name:'Volvé a conectar'}))
  fireEvent.click(screen.getByRole('button',{name:'Cerrar formulario de acceso'}))
  assert.equal(screen.queryByRole('heading',{name:'Volvé a conectar'}),null)
  fireEvent.click(screen.getAllByRole('button',{name:'Crear reclamo',exact:true})[0])
  fireEvent.change(screen.getByLabelText('Correo electrónico'),{target:{value:'test@example.invalid'}})
  fireEvent.change(screen.getByLabelText('Contraseña',{exact:true}),{target:{value:'Only-test-123'}})
  const submit=document.querySelector('form button[type="submit"]');fireEvent.click(submit)
  assert.ok(await screen.findByRole('heading',{name:'Crear un reclamo'}))
  assert.equal(screen.queryByRole('heading',{name:'Volvé a conectar'}),null)
})
test('load more displays progress and appends another page without duplicating rows',async()=>{
  const context=auth();let release,calls=0
  const pending=new Promise(r=>release=r)
  const repository=repo({list:async()=>{calls++;return calls===1?{rows:[claim],more:true,cursor:claim}:pending}})
  render(React.createElement(AuthProvider,{store:context.store},React.createElement(MyClaims,{repository,refresh:0,onOpen:()=>{},onCreate:()=>{},onDetail:()=>{}})))
  fireEvent.click(await screen.findByRole('button',{name:'Cargar más'}))
  assert.equal(screen.getByRole('button',{name:'Cargando más…'}).disabled,true)
  await act(async()=>{release({rows:[claim,{...claim,id:'second',title:'Segundo reclamo propio'}],more:false});await pending})
  assert.ok(await screen.findByText('Segundo reclamo propio'))
  assert.equal(screen.getAllByText('Reclamo propio A').length,1)
  assert.equal(screen.queryByRole('button',{name:'Cargar más'}),null)
})
test('own detail downloads photo, distinguishes moderation and clears image/data on logout',async()=>{
  const context=auth();let revoked=0
  const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL
  URL.createObjectURL=()=> 'blob:own-photo';URL.revokeObjectURL=()=>revoked++
  try{
    const repository=repo({list:async()=>({rows:[claim],more:false}),details:async()=>({claim,path:'private-path-not-for-UI',history:[],attachmentError:false,historyError:false}),photo:async()=>new Blob(['image'])})
    render(React.createElement(AuthProvider,{store:context.store},React.createElement(App,{claimsRepository:repository})))
    fireEvent.click(within(screen.getByRole('navigation',{name:'Navegación principal'})).getByRole('button',{name:'Mis reclamos'}))
    fireEvent.click(await screen.findByRole('button',{name:'Ver mi reclamo: Reclamo propio A'}))
    assert.ok(await screen.findByAltText('Fotografía adjunta a tu reclamo'))
    assert.ok(screen.getByText('Estamos revisando tu reclamo antes de compartirlo con la comunidad.'))
    assert.equal(screen.queryByText('private-path-not-for-UI'),null)
    fireEvent.click(screen.getByRole('button',{name:/^Cuenta de /})); fireEvent.click(screen.getByRole('menuitem',{name:'Cerrar sesión'}))
    await waitFor(()=>assert.equal(screen.queryByAltText('Fotografía adjunta a tu reclamo'),null))
    assert.equal(screen.queryByText('Reclamo propio A'),null);assert.equal(revoked,1)
  }finally{URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke}
})

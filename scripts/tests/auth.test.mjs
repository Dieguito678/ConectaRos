import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

let server, createAuthStore, validateAuthFields, authErrorMessage, parseAuthReturn
before(async () => {
  server = await createServer({envDir:false, server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } })
  ;({ createAuthStore } = await server.ssrLoadModule('/src/auth/auth-store.ts'))
  ;({ validateAuthFields } = await server.ssrLoadModule('/src/auth/auth-validation.ts'))
  ;({ authErrorMessage } = await server.ssrLoadModule('/src/auth/auth-errors.ts'))
  ;({ parseAuthReturn } = await server.ssrLoadModule('/src/auth/auth-return.ts'))
})
after(async () => { await server?.close() })

const session = id => ({ user: { id, user_metadata: { role: 'admin' } }, access_token: 'test-only', refresh_token: 'test-only' })
const fields = { displayName: '  Vecina  ', email: 'vecina@example.invalid', password: 'Test-only-1234', repeatPassword: 'Test-only-1234' }
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const tick = () => new Promise(resolve => setTimeout(resolve, 5))

function fakeClient(options = {}) {
  const listeners = new Set(), calls = []
  let inCallback = false, unsubscribed = 0
  const emit = (event, value) => {
    inCallback = true
    try { for (const callback of listeners) assert.equal(callback(event, value), undefined, 'callback must be synchronous') }
    finally { inCallback = false }
  }
  const client = {
    calls, emit, get unsubscribeCount() { return unsubscribed },
    auth: {
      onAuthStateChange(callback) { listeners.add(callback); return { data: { subscription: { unsubscribe() { listeners.delete(callback); unsubscribed++ } } } } },
      async getSession() { calls.push(['getSession']); return options.initial ? options.initial() : { data: { session: null }, error: null } },
      async signUp(payload) { calls.push(['signUp', payload]); return options.signup ? options.signup(payload) : { data: { user: { id: 'ambiguous-user' }, session: null }, error: null } },
      async signInWithPassword(payload) { calls.push(['signIn',payload]); return options.signin ? options.signin(payload) : { data: { session: null }, error: { code: 'invalid_credentials' } } },
      async signOut(payload) { calls.push(['signOut',payload]); if (options.signout) return options.signout(); emit('SIGNED_OUT',null); return { error: null } },
      async exchangeCodeForSession(code, settings) { calls.push(['exchange', code, settings]); return options.exchange ? options.exchange() : { data: { session: null }, error: { code: 'flow_state_not_found' } } },
    },
    from(table) {
      assert.equal(inCallback, false, 'no API requests inside auth callback')
      let userId
      const chain = {
        select() { return chain }, eq(_column,value) { userId=value; return chain }, abortSignal() { return chain },
        single() { return resolveQuery() }, returns() { return resolveQuery() },
      }
      async function resolveQuery() {
        calls.push(['select',table,userId])
        if (options.query) return options.query(table,userId)
        return { data: table === 'profiles' ? { id: userId, display_name: `Nombre ${userId}`, neighborhood: 'Centro' } : [], error: null }
      }
      return chain
    },
  }
  return client
}

test('valid signup sends only display_name metadata and stays anonymous until a session exists', async () => {
  const client = fakeClient(), store = createAuthStore(client,'http://localhost:5173')
  const stop = store.start(); await tick()
  const result = await store.signUp({ ...fields, role: 'admin', roles: ['ambassador'] })
  assert.equal(result.confirmationPending,true)
  assert.equal(result.message,'Revisá tu correo para confirmar tu cuenta')
  assert.equal(store.getSnapshot().session,null)
  const payload = client.calls.find(c => c[0] === 'signUp')[1]
  assert.deepEqual(payload.options,{ data: { display_name: 'Vecina' }, emailRedirectTo: 'http://localhost:5173/' })
  assert.equal(JSON.stringify(store.getSnapshot()).includes(fields.password),false)
  stop()
})
test('form validation: name limits, email, password length and mismatch', () => {
  assert.deepEqual(validateAuthFields('signup',fields),{})
  assert.ok(validateAuthFields('signup',{...fields,displayName:' '.repeat(4)}).displayName)
  assert.ok(validateAuthFields('signup',{...fields,displayName:'a'.repeat(81)}).displayName)
  assert.ok(validateAuthFields('signup',{...fields,displayName:'name\nline'}).displayName)
  assert.deepEqual(validateAuthFields('signup',{...fields,displayName:'😀'.repeat(80)}),{})
  assert.ok(validateAuthFields('signup',{...fields,email:'bad'}).email)
  assert.ok(validateAuthFields('signup',{...fields,password:'short',repeatPassword:'short'}).password)
  assert.ok(validateAuthFields('signup',{...fields,repeatPassword:'other'}).repeatPassword)
})
test('invalid fields never call auth signup', async () => {
  const client = fakeClient(), store = createAuthStore(client,'http://localhost:5173')
  const stop=store.start(); await tick()
  assert.equal((await store.signUp({...fields,password:'short'})).ok,false)
  assert.equal(client.calls.some(c=>c[0]==='signUp'),false); stop()
})
test('login errors are Spanish, safe, and cover policies/network/rate limits', () => {
  assert.match(authErrorMessage({code:'invalid_credentials'}),/incorrectos/)
  assert.match(authErrorMessage({code:'email_not_confirmed'}),/confirmado/)
  assert.match(authErrorMessage(new TypeError('SECRET')),/conexión/)
  assert.match(authErrorMessage({status:429}),/demasiados/)
  assert.match(authErrorMessage({code:'over_email_send_rate_limit'}),/límite de envío/)
  assert.match(authErrorMessage({code:'email_address_not_authorized'}),/enviar la confirmación/)
  assert.match(authErrorMessage({code:'weak_password'}),/requisitos/)
  assert.equal(authErrorMessage({message:'SECRET'}).includes('SECRET'),false)
})
test('successful login, profile read outside callback, and complete logout cleanup', async () => {
  const client=fakeClient({signin:async()=>{client.emit('SIGNED_IN',session('A'));return {data:{session:session('A')},error:null}}})
  const store=createAuthStore(client,'http://localhost:5173'), stop=store.start();await tick()
  assert.equal((await store.signIn(fields)).ok,true); await tick()
  assert.equal(store.getSnapshot().profile.id,'A');assert.deepEqual(store.getSnapshot().roles,[])
  await store.signOut()
  assert.equal(store.getSnapshot().session,null);assert.equal(store.getSnapshot().profile,null);assert.deepEqual(store.getSnapshot().roles,[])
  assert.equal(store.getSnapshot().profileError,null)
  assert.deepEqual(client.calls.find(c=>c[0]==='signOut')[1],{scope:'local'})
  stop();assert.equal(client.unsubscribeCount,1)
})
test('incorrect login never authenticates and duplicate submissions are blocked', async () => {
  const response=deferred(),client=fakeClient({signin:()=>response.promise}),store=createAuthStore(client,'http://localhost:5173')
  const stop=store.start();await tick()
  const pending=store.signIn(fields)
  assert.equal((await store.signIn(fields)).ok,false)
  response.resolve({data:{session:null},error:{code:'invalid_credentials'}})
  assert.match((await pending).message,/incorrectos/);assert.equal(store.getSnapshot().session,null);stop()
})
test('restores a session without trusting metadata roles', async () => {
  const client=fakeClient({initial:async()=>({data:{session:session('A')},error:null})}),store=createAuthStore(client,'http://localhost:5173')
  const stop=store.start();await tick();await tick()
  assert.equal(store.getSnapshot().session.user.id,'A');assert.deepEqual(store.getSnapshot().roles,[]);stop()
})
test('a profile failure preserves session, clears private permissions, and can retry', async () => {
  let fail=true
  const client=fakeClient({initial:async()=>({data:{session:session('A')},error:null}),query:async(table,id)=>fail?{data:null,error:{code:'42501'}}:{data:table==='profiles'?{id,display_name:'Cuenta A'}:[{role:'ambassador'}],error:null}})
  const store=createAuthStore(client,'http://localhost:5173'),stop=store.start();await tick();await tick()
  assert.equal(store.getSnapshot().session.user.id,'A');assert.equal(store.getSnapshot().profile,null);assert.match(store.getSnapshot().profileError,/sesión sigue activa/)
  fail=false;store.retryProfile();await tick()
  assert.equal(store.getSnapshot().profile.display_name,'Cuenta A');assert.deepEqual(store.getSnapshot().roles,['ambassador']);stop()
})
test('late profile A cannot leak after switching to account B', async () => {
  const late=deferred(),client=fakeClient({query:async(table,id)=>id==='A'?late.promise:{data:table==='profiles'?{id,display_name:'Cuenta B'}:[],error:null}})
  const store=createAuthStore(client,'http://localhost:5173'),stop=store.start();await tick()
  client.emit('SIGNED_IN',session('A'));await tick()
  client.emit('SIGNED_IN',session('B'));assert.equal(store.getSnapshot().profile,null);await tick()
  late.resolve({data:{id:'A',display_name:'Cuenta A'},error:null});await tick()
  assert.equal(store.getSnapshot().profile.display_name,'Cuenta B');stop()
})
test('late initial session cannot resurrect a logged-out user', async () => {
  const late=deferred(),client=fakeClient({initial:()=>late.promise}),store=createAuthStore(client,'http://localhost:5173'),stop=store.start()
  client.emit('SIGNED_IN',session('A'));await tick();await store.signOut()
  late.resolve({data:{session:session('A')},error:null});await tick()
  assert.equal(store.getSnapshot().session,null);assert.equal(store.getSnapshot().profile,null);stop()
})
test('late profile after logout cannot restore private data', async () => {
  const late=deferred(),client=fakeClient({query:()=>late.promise}),store=createAuthStore(client,'http://localhost:5173'),stop=store.start();await tick()
  client.emit('SIGNED_IN',session('A'));await tick();await store.signOut()
  late.resolve({data:{id:'A',display_name:'Cuenta A'},error:null});await tick()
  assert.equal(store.getSnapshot().profile,null);assert.deepEqual(store.getSnapshot().roles,[]);stop()
})
test('failed logout hides private data without claiming success', async () => {
  const client=fakeClient({signout:async()=>({error:{status:500}})}),store=createAuthStore(client,'http://localhost:5173'),stop=store.start();await tick()
  client.emit('SIGNED_IN',session('A'));await tick();await store.signOut()
  assert.equal(store.getSnapshot().session,null);assert.equal(store.getSnapshot().profile,null);assert.equal(store.getSnapshot().logoutUncertain,true)
  assert.match(store.getSnapshot().sessionError,/No pudimos confirmar/)
  assert.equal((await store.signIn(fields)).ok,false);stop()
})
test('confirmation code exchanged once across StrictMode remount, errors do not log out existing session', async () => {
  const client=fakeClient({initial:async()=>({data:{session:session('A')},error:null})}),store=createAuthStore(client,'http://localhost:5173',{kind:'code',code:'test-only',flowId:'test-flow'})
  const stop1=store.start();stop1();const stop2=store.start();await tick();await tick()
  assert.equal(client.calls.filter(c=>c[0]==='exchange').length,1)
  assert.equal(store.getSnapshot().session.user.id,'A');assert.equal(store.getSnapshot().notice.type,'error')
  stop2();assert.equal(client.unsubscribeCount,2)
})
test('return parser scrubs secrets, preserves unrelated URL state and never renders raw error descriptions', () => {
  const parsed=parseAuthReturn('https://app.example/?code=TESTCODE&sb_flow_id=TESTFLOW&keep=1#reclamos')
  assert.equal(parsed.cleanUrl,'/?keep=1#reclamos');assert.deepEqual(parsed.result,{kind:'code',code:'TESTCODE',flowId:'TESTFLOW'})
  const error=parseAuthReturn('https://app.example/#error=access_denied&error_code=otp_expired&error_description=PRIVATE')
  assert.equal(error.cleanUrl,'/');assert.equal(error.result.code,'otp_expired');assert.equal(JSON.stringify(error.result).includes('PRIVATE'),false)
  const implicit=parseAuthReturn('https://app.example/#access_token=TOKEN&refresh_token=REFRESH&type=signup')
  assert.equal(implicit.cleanUrl,'/');assert.equal(implicit.result.kind,'error');assert.equal(JSON.stringify(implicit.result).includes('TOKEN'),false)
  assert.equal(parseAuthReturn('https://app.example/#reclamos').changed,false)
})
test('successful confirmation establishes a real returned session and shows a safe notice', async () => {
  const pending=deferred()
  const client=fakeClient({exchange:async()=>{await pending.promise;client.emit('SIGNED_IN',session('A'));return {data:{session:session('A')},error:null}},initial:async()=>({data:{session:session('A')},error:null})})
  const store=createAuthStore(client,'http://localhost:5173',{kind:'code',code:'only-test-code'}),stop=store.start()
  client.emit('INITIAL_SESSION',null)
  assert.equal(store.getSnapshot().loading,true)
  assert.equal((await store.signIn(fields)).ok,false)
  pending.resolve()
  await tick();await tick()
  assert.equal(store.getSnapshot().session.user.id,'A')
  assert.match(store.getSnapshot().notice.text,/sesión está activa/)
  assert.equal(JSON.stringify(store.getSnapshot().notice).includes('only-test-code'),false);stop()
})
test('initial session errors are not hidden by INITIAL_SESSION and can be retried', async () => {
  let fail=true
  const initial=deferred(),client=fakeClient({initial:()=>fail?initial.promise:Promise.resolve({data:{session:session('A')},error:null})})
  const store=createAuthStore(client,'http://localhost:5173'),stop=store.start()
  client.emit('INITIAL_SESSION',null)
  initial.resolve({data:{session:null},error:{name:'AuthRetryableFetchError'}});await tick()
  assert.match(store.getSnapshot().sessionError,/conexión/)
  fail=false;store.retrySession();await tick();await tick()
  assert.equal(store.getSnapshot().session.user.id,'A');assert.equal(store.getSnapshot().sessionError,null);stop()
})
test('late login result does not overwrite a newer account event', async () => {
  const pending=deferred(),client=fakeClient({signin:()=>pending.promise}),store=createAuthStore(client,'http://localhost:5173'),stop=store.start();await tick()
  const request=store.signIn(fields)
  client.emit('SIGNED_IN',session('A'));client.emit('SIGNED_IN',session('B'))
  pending.resolve({data:{session:session('A')},error:null})
  assert.equal((await request).ok,false);assert.equal(store.getSnapshot().session.user.id,'B');stop()
})
test('cross-tab logout during pending login suppresses its late session and cleans SDK state', async () => {
  const pending=deferred(),client=fakeClient({signin:()=>pending.promise}),store=createAuthStore(client,'http://localhost:5173'),stop=store.start();await tick()
  const request=store.signIn(fields)
  client.emit('SIGNED_OUT',null)
  client.emit('SIGNED_IN',session('A')) // late SDK event from the in-flight request
  assert.equal(store.getSnapshot().session,null)
  pending.resolve({data:{session:session('A')},error:null})
  assert.equal((await request).ok,false)
  assert.equal(store.getSnapshot().session,null);assert.equal(store.getSnapshot().profile,null)
  assert.equal(store.getSnapshot().logoutUncertain,false)
  assert.equal(client.calls.filter(c=>c[0]==='signOut').length,1);stop()
})
test('switching accounts clears already-loaded permissions before the next profile resolves', async () => {
  const pending=deferred(),client=fakeClient({query:async(table,id)=>id==='B'?pending.promise:{data:table==='profiles'?{id,display_name:'Cuenta A'}:[{role:'admin'}],error:null}})
  const store=createAuthStore(client,'http://localhost:5173'),stop=store.start();await tick()
  client.emit('SIGNED_IN',session('A'));await tick()
  assert.deepEqual(store.getSnapshot().roles,['admin'])
  client.emit('SIGNED_IN',session('B'))
  assert.equal(store.getSnapshot().profile,null);assert.deepEqual(store.getSnapshot().roles,[])
  stop();pending.resolve({data:null,error:null})
})

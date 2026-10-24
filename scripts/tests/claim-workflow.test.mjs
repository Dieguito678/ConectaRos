import {before,after,test} from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'vite'
let server,createClaimsRepository,createSubmission,validateClaim,validatePhoto
before(async()=>{
  server=await createServer({envDir:false,server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}})
  ;({createClaimsRepository}=await server.ssrLoadModule('/src/claims/repository.ts'))
  ;({createSubmission}=await server.ssrLoadModule('/src/claims/submission.ts'))
  ;({validateClaim,validatePhoto}=await server.ssrLoadModule('/src/claims/model.ts'))
})
after(async()=>{await server?.close()})
const user='33000000-0000-4000-8000-000000000001',id='23000000-0000-4000-8000-000000000001'
const category={id:'10000000-0000-4000-8000-000000000001',slug:'alumbrado',name:'Alumbrado'}
const draft={title:'Título de prueba',categoryId:category.id,description:'Descripción ficticia de prueba',address:'Prueba 123',neighborhood:'Centro'}
const own={id,author_id:user,category_id:category.id,title:draft.title,description:draft.description,address:draft.address,neighborhood:draft.neighborhood,status:'publicado',moderation_status:'aprobado',is_demo:true,created_at:'2026-10-24T12:00:00+00:00',category}
const scope=()=>({userId:user,signal:new AbortController().signal,isCurrent:()=>true})
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve}}
const photo=()=>new File([new Uint8Array([255,216,255,0])],'private-original-name.jpg',{type:'image/jpeg'})
function clientFor(handler,storage={}) {
  const calls=[]
  function chain(context){
    const query={}
    for(const method of ['select','eq','order','limit','or','is','abortSignal'])query[method]=(...args)=>{context.steps.push([method,...args]);return query}
    const run=()=>{calls.push(context);return Promise.resolve(handler(context))}
    query.maybeSingle=run;query.returns=()=>query;query.then=(resolve,reject)=>run().then(resolve,reject)
    return query
  }
  return{calls,from:table=>chain({kind:'query',table,steps:[]}),rpc:(name,args)=>chain({kind:'rpc',name,args,steps:[]}),
    storage:{from:bucket=>({
      upload:async(path,file,options)=>{
        calls.push({kind:'upload',bucket,path,options})
        return storage.upload?.(path,file,options)??{data:{path},error:null}
      },
      download:async(path)=>{
        calls.push({kind:'download',bucket,path})
        return storage.download?.(path)??{data:new Blob(['image']),error:null}
      },
    })},
  }
}
test('validates field limits, real category UUID, whitespace and image MIME/size/content',async()=>{
  assert.deepEqual(validateClaim(draft,[category]),{})
  for(const [key,value] of [['title','    '],['title','a'.repeat(161)],['description','short'],['address','ab'],['neighborhood','x'],['categoryId','alumbrado']])assert.ok(validateClaim({...draft,[key]:value},[category])[key])
  assert.equal(await validatePhoto(photo()),null)
  assert.match(await validatePhoto(new File(['<svg/>'],'fake.jpg',{type:'image/jpeg'})),/contenido/)
  assert.match(await validatePhoto(new File(['a'],'image.svg',{type:'image/svg+xml'})),/JPEG/)
  assert.match(await validatePhoto(new File([new Uint8Array(5*1024*1024+1)],'big.png',{type:'image/png'})),/5 MiB/)
})
test('repository uses remote categories and explicit author filter with stable keyset pagination',async()=>{
  const client=clientFor(c=>({data:c.table==='categories'?[category]:Array.from({length:13},(_,i)=>({...own,id:`${id.slice(0,-2)}${String(i).padStart(2,'0')}`})),error:null}))
  const repository=createClaimsRepository(client)
  assert.equal((await repository.categories(new AbortController().signal))[0].id,category.id)
  const page=await repository.list(scope());assert.equal(page.rows.length,12);assert.equal(page.more,true)
  await repository.list(scope(),page.cursor)
  const calls=client.calls.filter(c=>c.table==='claims')
  assert.ok(calls.every(c=>c.steps.some(s=>s[0]==='eq'&&s[1]==='author_id'&&s[2]===user)))
  assert.ok(calls[0].steps.some(s=>s[0]==='order'&&s[1]==='created_at'&&s[2].ascending===false))
  assert.ok(calls[0].steps.some(s=>s[0]==='order'&&s[1]==='id'&&s[2].ascending===false))
  assert.ok(calls[1].steps.some(s=>s[0]==='or'&&s[1].includes('id.lt.')))
})
test('creation uses only fixed RPC inputs and reconciles an existing request before writing',async()=>{
  let exists=false
  const client=clientFor(c=>{if(c.kind==='rpc'){exists=true;return{data:id,error:null}}return{data:exists?own:null,error:null}})
  const repository=createClaimsRepository(client)
  await repository.submit(id,draft,scope());await repository.submit(id,draft,scope())
  const calls=client.calls.filter(c=>c.kind==='rpc');assert.equal(calls.length,1)
  assert.equal(calls[0].name,'submit_demo_claim');assert.equal(calls[0].args.p_expected_user,user)
  assert.equal(calls[0].args.author_id,undefined);assert.equal(calls[0].args.status,undefined);assert.equal(calls[0].args.is_demo,undefined)
})
test('lost creation response is reconciled with saved row, with no duplicate RPC',async()=>{
  let exists=false
  const client=clientFor(c=>{if(c.kind==='rpc'){exists=true;return{data:null,error:{code:'',message:'PRIVATE'}}}return{data:exists?own:null,error:null}})
  assert.equal(await createClaimsRepository(client).submit(id,draft,scope()),id)
  assert.equal(client.calls.filter(c=>c.kind==='rpc').length,1)
})
test('failed reconciliation never blindly inserts and foreign/inexistent IDs return null',async()=>{
  const client=clientFor(()=>({data:null,error:{code:'network'}}))
  await assert.rejects(createClaimsRepository(client).submit(id,draft,scope()),error=>error.uncertain===true)
  assert.equal(client.calls.some(c=>c.kind==='rpc'),false)
  const empty=clientFor(()=>({data:null,error:null}))
  assert.equal(await createClaimsRepository(empty).getOwn(id,scope()),null)
})
test('photo upload tolerates lost success response and never overwrites or uses original filename',async()=>{
  let uploaded=false
  const client=clientFor(()=>({data:uploaded?id:null,error:uploaded?null:{code:'P0002'}}),{upload:async()=>{uploaded=true;return{data:null,error:{message:'response lost'}}}})
  const path=`${user}/${id}/claim/73000000-0000-4000-8000-000000000001.jpg`
  await createClaimsRepository(client).attach(id,path,photo(),scope())
  await createClaimsRepository(client).attach(id,path,photo(),scope())
  const uploads=client.calls.filter(c=>c.kind==='upload');assert.equal(uploads.length,1)
  assert.equal(uploads[0].options.upsert,false);assert.equal(uploads[0].bucket,'claim-photos');assert.ok(!uploads[0].path.includes('private-original'))
})
test('double click creates one claim; photo failure/retry never recreates or loses the claim',async()=>{
  const pending=defer();let writes=0,attachments=0,saved=0
  const repository={submit:async()=>{writes++;await pending.promise;return id},attach:async()=>{attachments++;if(attachments===1)throw new Error('failed')}}
  const store=createSubmission(repository,scope(),()=>saved++)
  const first=store.submit(draft,photo());await store.submit(draft,photo());assert.equal(writes,1)
  pending.resolve();await first
  assert.equal(store.getSnapshot().stage,'photo_error');assert.equal(store.getSnapshot().claimId,id);assert.equal(saved,1)
  await store.submit(draft,photo());assert.equal(store.getSnapshot().stage,'done');assert.equal(writes,1);assert.equal(attachments,2);assert.equal(saved,1)
})
test('ambiguous retry retains the exact request ID and snapshot',async()=>{
  const attempts=[];let fail=true
  const repository={submit:async(id,value)=>{attempts.push({id,value});if(fail)throw new Error('network');return id},attach:async()=>{}}
  const store=createSubmission(repository,scope(),()=>{})
  await store.submit(draft,null);assert.equal(store.getSnapshot().stage,'uncertain')
  fail=false;await store.submit({...draft,title:'must not replace the original'},null)
  assert.equal(attempts[0].id,attempts[1].id);assert.equal(attempts[1].value.title,draft.title)
})
test('logout or user change during save/upload ignores late results and private callbacks',async()=>{
  let current=true,saved=0,attached=0;const pending=defer()
  const store=createSubmission({submit:async()=>{await pending.promise;return id},attach:async()=>attached++},{...scope(),isCurrent:()=>current},()=>saved++)
  const work=store.submit(draft,photo());current=false;pending.resolve();await work
  assert.equal(saved,0);assert.equal(attached,0);assert.equal(store.getSnapshot().claimId,null)
})
test('detail reads only own claim, own attachment and public history; download uses private bucket',async()=>{
  const client=clientFor(c=>({data:c.table==='claims'?own:c.table==='claim_attachments'?[{storage_path:`${user}/${id}/claim/test.jpg`}]:[],error:null}))
  const repository=createClaimsRepository(client),details=await repository.details(id,scope())
  assert.equal(details.claim.id,id);assert.deepEqual(details.history,[])
  await repository.photo(details.path,scope())
  assert.ok(client.calls.filter(c=>c.table).every(c=>['claims','claim_attachments','claim_history'].includes(c.table)))
  assert.equal(client.calls.find(c=>c.kind==='download').bucket,'claim-photos')
})

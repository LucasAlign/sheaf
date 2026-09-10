type Registry={registerTool:(tool:{name:string;description:string;inputSchema:object;annotations:object;execute:(input:unknown)=>unknown},options:{signal:AbortSignal})=>void|Promise<void>};
export function registerSheafTools(registry:Registry|undefined,showNeed:(id:string)=>void,allowedIds:string[]) {
 if(!registry?.registerTool)return()=>{};
 const lifecycle=new AbortController();
 const registration=registry.registerTool({name:'show_sheaf_need',description:'Open the details of an accessible Sheaf need. This does not claim, approve, or email anyone.',inputSchema:{type:'object',properties:{need_id:{type:'string'}},required:['need_id'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input){if(!input||typeof input!=='object'||Object.keys(input).length!==1||!('need_id' in input)||typeof input.need_id!=='string'||!allowedIds.includes(input.need_id))throw new Error('Choose an accessible need ID.');showNeed(input.need_id);return {opened:input.need_id};}},{signal:lifecycle.signal});
 void Promise.resolve(registration).catch(()=>{});
 return()=>lifecycle.abort();
}
export function browserRegistry(){return (document as Document&{modelContext?:Registry}).modelContext;}

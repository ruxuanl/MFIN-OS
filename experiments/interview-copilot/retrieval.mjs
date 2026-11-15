export const CHUNKER='paragraph-char-v2';
export function chunkDocument(doc){
  const sections=doc.sections||[{text:doc.text}],chunks=[];let global=0;
  for(const section of sections){const text=section.text;for(let start=0;start<text.length;){let end=Math.min(start+380,text.length);if(end<text.length){const boundary=text.lastIndexOf('\n',end);if(boundary>start+190)end=boundary+1;}
    const slice=text.slice(start,end);if(slice.trim())chunks.push({id:doc.id+':'+chunks.length,document_version_id:doc.id,source_hash:doc.hash,project_id:doc.project,text:slice,file:doc.name,line:global+start,start,end,page:section.page??null,paragraph:section.paragraph??null,line_start:text.slice(0,start).split('\n').length,line_end:text.slice(0,end).split('\n').length,chunker:CHUNKER});
    if(end===text.length)break;start=end-60;}
    global+=text.length+1;
  }return chunks;
}
export function currentDocuments(docs){const latest=new Map();for(const d of docs.filter(d=>d.ready)){const key=d.document_id||d.name;const old=latest.get(key);if(!old||(d.version||1)>(old.version||1))latest.set(key,d);}return [...latest.values()];}
function tokenize(text){const values=String(text).toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]+/g)||[];return values.flatMap(v=>/^[\u4e00-\u9fff]+$/.test(v)&&v.length>1?Array.from({length:v.length-1},(_,i)=>v.slice(i,i+2)):[v]);}
export function terms(text){return [...new Set(tokenize(text))];}
export function keywordRank(chunks,q){
  const query=terms(q);if(!query.length)return [];
  const docs=chunks.map(c=>({c,tokens:tokenize(c.text)})),N=docs.length,frequency=new Map();
  const average=docs.reduce((n,d)=>n+d.tokens.length,0)/(N||1)||1;
  for(const d of docs)for(const t of new Set(d.tokens))frequency.set(t,(frequency.get(t)||0)+1);
  return docs.map(({c,tokens})=>{
    const tf=new Map();for(const t of tokens)tf.set(t,(tf.get(t)||0)+1);
    let score=0;for(const term of query){const count=tf.get(term)||0;if(count){const df=frequency.get(term)||0;score+=Math.log(1+(N-df+.5)/(df+.5))*count*2.2/(count+1.2*(.25+.75*tokens.length/average));}}
    return {...c,score};
  }).filter(c=>c.score>0).sort((a,b)=>b.score-a.score).slice(0,40);
}
export function cosine(a,b){if(a.length!==b.length||!a.length)return 0;let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]**2;bb+=b[i]**2;}return dot/(Math.sqrt(aa*bb)||1);}
export function fuse(keyword,semantic=[]){const scores=new Map(),byId=new Map();for(const list of [keyword,semantic])list.forEach((c,i)=>{scores.set(c.id,(scores.get(c.id)||0)+1/(60+i+1));byId.set(c.id,c);});return [...scores].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([id,score])=>{const {vector,...c}=byId.get(id);return {...c,score};});}
export function retrieve(docs,q){return fuse(keywordRank(currentDocuments(docs).flatMap(d=>d.chunks?.length?d.chunks:chunkDocument(d)),q));}
export async function hybridRetrieve(docs,q,embedding){const chunks=currentDocuments(docs).flatMap(d=>d.chunks?.length?d.chunks:chunkDocument(d)),keyword=keywordRank(chunks,q);let semantic=[],mode='keyword';
  const indexed=chunks.filter(c=>c.vector?.length===512&&c.embedding_model===embedding?.model);
  if(indexed.length&&embedding?.status!=='unavailable'){try{const result=await embedding.embed([q],true),v=result.vectors[0];semantic=indexed.map(c=>({...c,similarity:cosine(c.vector,v)})).sort((a,b)=>b.similarity-a.similarity).slice(0,20);mode='hybrid';}catch{}}
  // Semantic neighbors alone are not sufficient evidence: require a lexical anchor in v1.
  const anchors=new Set(keyword.map(c=>c.id));
  // Every returned citation needs its own lexical anchor. An unrelated neighbor
  // cannot borrow legitimacy from another chunk merely because fusion ranked it.
  const hits=keyword.length?fuse(keyword,semantic.filter(c=>anchors.has(c.id))):[];
  return {hits,mode,semantic_candidates:semantic.length,evidence_policy:'per-chunk-anchor-bm25-v2'};
}

import {DatabaseSync} from 'node:sqlite';
import {readFile,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

export async function openStorage(dir){
  const sql=new DatabaseSync(fileURLToPath(new URL('knowledge.sqlite',dir)));
  sql.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS app_state(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS document_versions(id TEXT PRIMARY KEY,project_id TEXT NOT NULL,payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chunks(id TEXT PRIMARY KEY,document_id TEXT NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS documents_project ON document_versions(project_id);
    CREATE INDEX IF NOT EXISTS chunks_document ON chunks(document_id);`);
  let state;const row=sql.prepare('SELECT payload FROM app_state WHERE id=1').get();
  if(row){state=JSON.parse(row.payload);state.docs=sql.prepare('SELECT payload FROM document_versions ORDER BY rowid').all().map(r=>JSON.parse(r.payload));const chunks=sql.prepare('SELECT document_id,payload FROM chunks ORDER BY rowid').all();for(const d of state.docs)d.chunks=chunks.filter(c=>c.document_id===d.id).map(c=>JSON.parse(c.payload));}
  else{try{state=JSON.parse(await readFile(new URL('db.json',dir),'utf8'));await copyFile(new URL('db.json',dir),new URL('legacy-db.backup.json',dir));}catch(e){if(e.code!=='ENOENT')throw e;}state??={projects:[],docs:[],sessions:[]};}
  let documentCache=new Map(sql.prepare('SELECT id,payload FROM document_versions').all().map(r=>[r.id,r.payload]));
  let chunkCache=new Map(sql.prepare('SELECT id,payload FROM chunks').all().map(r=>[r.id,r.payload]));
  return {state,save(db){const nextDocs=new Map(),nextChunks=new Map();sql.exec('BEGIN IMMEDIATE');try{
    const {docs,...rest}=db;sql.prepare('INSERT OR REPLACE INTO app_state VALUES(1,?)').run(JSON.stringify(rest));
    const doc=sql.prepare('INSERT INTO document_versions VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload'),chunk=sql.prepare('INSERT INTO chunks VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload');
    for(const d of docs){const {chunks=[],...meta}=d,payload=JSON.stringify(meta);nextDocs.set(d.id,payload);if(documentCache.get(d.id)!==payload)doc.run(d.id,d.project,payload);for(const c of chunks){const payload=JSON.stringify(c);nextChunks.set(c.id,payload);if(chunkCache.get(c.id)!==payload)chunk.run(c.id,d.id,payload);}}
    for(const id of chunkCache.keys())if(!nextChunks.has(id))sql.prepare('DELETE FROM chunks WHERE id=?').run(id);
    for(const id of documentCache.keys())if(!nextDocs.has(id))sql.prepare('DELETE FROM document_versions WHERE id=?').run(id);
    sql.exec('COMMIT');
    documentCache=nextDocs;chunkCache=nextChunks;
  }catch(e){sql.exec('ROLLBACK');throw e;}},close(){sql.close();}};
}

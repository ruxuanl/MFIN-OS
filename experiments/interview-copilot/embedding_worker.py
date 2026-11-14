import json,os,sys
os.environ['HF_HUB_OFFLINE']='1'
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
model=None
for line in sys.stdin.buffer:
    try:
        request=json.loads(line)
        if model is None:
            from fastembed import TextEmbedding
            model=TextEmbedding(model_name='BAAI/bge-small-zh-v1.5',cache_dir=sys.argv[1],local_files_only=True,threads=2)
        texts=request.get('texts',[])
        vectors=list(model.query_embed(texts) if request.get('query') else model.passage_embed(texts)) if texts else []
        result={'id':request['id'],'model':'BAAI/bge-small-zh-v1.5','dimension':512,'vectors':[v.tolist() for v in vectors]}
    except Exception:
        result={'id':request.get('id'),'error':'LOCAL_EMBEDDING_UNAVAILABLE'}
    sys.stdout.buffer.write((json.dumps(result)+'\n').encode('utf8'));sys.stdout.buffer.flush()

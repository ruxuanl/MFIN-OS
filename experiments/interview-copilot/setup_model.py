from pathlib import Path
from fastembed import TextEmbedding

cache=Path(__file__).resolve().parent/'runtime-data'/'models'
cache.mkdir(parents=True,exist_ok=True)
model=TextEmbedding(model_name='BAAI/bge-small-zh-v1.5',cache_dir=str(cache),threads=2)
vector=list(model.embed(['本地中文检索模型安装验证']))[0]
print(f'本地模型就绪：BAAI/bge-small-zh-v1.5，{len(vector)} 维。日常推理使用本地缓存，不上传材料。')

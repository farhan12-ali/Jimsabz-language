"""Local statistical Jimsabz agent training. No external model or code corpus.
Prompt text is natural language; every code target is compiler-validated Jimsabz.
This trains intent classification and token statistics, not a code LLM.
"""
from pathlib import Path
from collections import Counter, defaultdict
import json, math, re, hashlib, subprocess
ROOT = Path(__file__).resolve().parents[1]
source = Path(__file__).with_name('curriculum.jsonl')
subprocess.run(['node', str(Path(__file__).with_name('validate.mjs')), str(source)], check=True)
samples = [json.loads(line) for line in source.read_text(encoding='utf-8').splitlines() if line]
def features(prompt):
    words = re.findall(r'[^\W_]+(?:_[^\W_]+)*', prompt.lower(), re.UNICODE)
    return words + [a+'_'+b for a,b in zip(words,words[1:])]
train=[s for s in samples if s['split']=='train']; test=[s for s in samples if s['split']=='test']
counts,docs=defaultdict(Counter),Counter()
for item in train: counts[item['intent']].update(features(item['prompt'])); docs[item['intent']]+=1
vocabulary=sorted(set().union(*(set(c) for c in counts.values())))
labels={}
for intent,words in counts.items():
    denominator=sum(words.values())+len(vocabulary)
    labels[intent]={'prior':math.log(docs[intent]/len(train)),'unknown':math.log(1/denominator),'words':{w:math.log((n+1)/denominator) for w,n in words.items()}}
next_counts=defaultdict(Counter)
for item in train:
    tokens=re.findall(r'[^\W\d]\w*|"[^"\n]*"|[^\s]',item['code'],re.UNICODE)
    for first,second in zip(tokens,tokens[1:]):next_counts[first][second]+=1
model={'version':3,'method':'multinomial-naive-bayes + code-token-bigrams','language':'Jimsabz','code_corpus':'Jimsabz only','samples':len(train),'dataset_samples':len(samples),'test_samples':len(test),'dataset_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'vocabulary':vocabulary,'labels':labels,'next':{t:c.most_common(5) for t,c in next_counts.items()}}
def predict(prompt):
    terms=[w for w in features(prompt) if w in vocabulary]
    return max(labels,key=lambda k:labels[k]['prior']+sum(labels[k]['words'].get(w,labels[k]['unknown']) for w in terms))
results=[{'prompt':s['prompt'],'expected':s['intent'],'actual':predict(s['prompt'])}for s in test]
correct=sum(r['expected']==r['actual'] for r in results)
report={'training_samples':len(train),'test_samples':len(test),'correct':correct,'accuracy':correct/len(test),'compiler_validated_targets':len(samples),'split':'Held-out request phrasings; paired please variants stay in the same split.','limitations':'Small curated domain; scores do not measure arbitrary game generation. Code uses parameterized, compiler-checked builders. No large language model was fine-tuned.','results':results}
out=ROOT/('dist' if (ROOT/'dist').exists() else 'studio')/'agent';out.mkdir(parents=True,exist_ok=True)
(out/'model.json').write_text(json.dumps(model,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
Path(__file__).with_name('evaluation.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf-8')
print(f'Trained on {len(train)} samples; held-out accuracy {correct}/{len(test)} ({correct/len(test):.1%}).')

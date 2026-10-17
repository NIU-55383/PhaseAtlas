import {simulate,continueFront} from './science.js';
self.onmessage=({data})=>{try{const result=data.type==='continue'?continueFront(data.alpha,data.beta):simulate(data.config,p=>self.postMessage({type:'progress',progress:p}));self.postMessage({type:'result',result});}catch(error){self.postMessage({type:'error',message:error.message});}};

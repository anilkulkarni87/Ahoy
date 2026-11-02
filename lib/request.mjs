// Stop reading at the byte limit, including requests without Content-Length.
export async function readLimitedText(request,limit) {
 if(Number(request.headers.get('content-length'))>limit)throw Object.assign(new Error('This request is too large.'),{status:413});
 if(!request.body)return '';
 const reader=request.body.getReader();let total=0;const chunks=[];
 try {
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit){await reader.cancel();throw Object.assign(new Error('This request is too large.'),{status:413});}chunks.push(value);}
  return Buffer.concat(chunks).toString('utf8');
 }finally{reader.releaseLock();}
}

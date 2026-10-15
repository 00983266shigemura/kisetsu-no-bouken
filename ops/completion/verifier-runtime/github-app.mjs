import { createSign } from 'node:crypto';

const b64url = value => Buffer.from(value).toString('base64url');
export function appJwt(appId, privateKey, nowSeconds = Math.floor(Date.now()/1000)) {
  if (!appId || !privateKey) throw new Error('APP_CREDENTIAL_MISSING');
  const header=b64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const payload=b64url(JSON.stringify({iat:nowSeconds-60,exp:nowSeconds+540,iss:String(appId)}));
  const input=`${header}.${payload}`;
  const signer=createSign('RSA-SHA256'); signer.update(input); signer.end();
  return `${input}.${signer.sign(privateKey).toString('base64url')}`;
}

export async function githubRequest(path, {token, method='GET', body, fetchImpl=fetch}) {
  const response=await fetchImpl(`https://api.github.com${path}`,{
    method,
    headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
  });
  if (!response.ok) throw new Error(`GITHUB_API_${response.status}:${path}`);
  return response.status===204?null:response.json();
}

export async function installationToken({appId,installationId,privateKey,fetchImpl=fetch}) {
  const jwt=appJwt(appId,privateKey);
  const response=await fetchImpl(`https://api.github.com/app/installations/${installationId}/access_tokens`,{
    method:'POST',headers:{Authorization:`Bearer ${jwt}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}
  });
  if(!response.ok) throw new Error(`GITHUB_INSTALLATION_TOKEN_${response.status}`);
  const result=await response.json();
  if(!result.token || Date.parse(result.expires_at)<=Date.now()) throw new Error('INSTALLATION_TOKEN_INVALID');
  return result.token;
}

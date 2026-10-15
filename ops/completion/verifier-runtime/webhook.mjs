import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { normalizeWebhook } from './core.mjs';

const sqs=new SQSClient({});
const secretsClient=new SecretsManagerClient({});
const getHeader=(headers,name)=>Object.entries(headers||{}).find(([k])=>k.toLowerCase()===name.toLowerCase())?.[1];
let webhookSecrets, secretsUntil=0;

export async function handler(event) {
  try {
    if(!webhookSecrets||Date.now()>=secretsUntil){
      const secretResult=await secretsClient.send(new GetSecretValueCommand({SecretId:process.env.WEBHOOK_SECRET_ARN}));
      webhookSecrets=JSON.parse(secretResult.SecretString||'{}');
      if(!webhookSecrets.current)throw new Error('WEBHOOK_SECRET_MISSING');
      secretsUntil=Date.now()+60000;
    }
    const rawBody=event.isBase64Encoded?Buffer.from(event.body||'','base64'):Buffer.from(event.body||'','utf8');
    const item=normalizeWebhook({rawBody,signature:getHeader(event.headers,'x-hub-signature-256'),secrets:[webhookSecrets.current,webhookSecrets.previous],deliveryId:getHeader(event.headers,'x-github-delivery'),eventName:getHeader(event.headers,'x-github-event'),repoId:Number(process.env.REPOSITORY_ID),installationId:Number(process.env.INSTALLATION_ID)});
    if(item.ignored) return {statusCode:202,body:'accepted'};
    await sqs.send(new SendMessageCommand({QueueUrl:process.env.QUEUE_URL,MessageBody:JSON.stringify(item)}));
    return {statusCode:202,body:'queued'};
  } catch(error) {
    const message=String(error?.message||'');
    const authFailure=message==='WEBHOOK_SIGNATURE_INVALID';
    const clientFailure=/^(WEBHOOK_JSON_INVALID|WEBHOOK_SCOPE_INVALID|DELIVERY_ID_INVALID)$/.test(message);
    return {statusCode:authFailure?401:(clientFailure?400:503),body:(authFailure||clientFailure)?'rejected':'temporarily unavailable'};
  }
}

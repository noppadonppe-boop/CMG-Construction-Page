const { parse } = require('dotenv');
const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const env = parse(readFileSync('.env'));
for (const key of ['SMTP_HOST','SMTP_PORT','SMTP_SECURE','SMTP_USER','SMTP_PASS','MAIL_FROM']) {
  if (!env[key]) throw new Error('Missing '+key);
  const result = spawnSync('npx.cmd', ['--yes','firebase-tools','functions:secrets:set',key,'--project','cmg-construction-page','--data-file','-','--non-interactive'], {input:env[key],encoding:'utf8',shell:true});
  if(result.status) { console.error(result.stderr); process.exit(1); }
  console.log(key+' uploaded');
}

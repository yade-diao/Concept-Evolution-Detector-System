// End-to-end check of the verification email, against the live deployment.
//
// Starts a registration for a test mailbox in the deployment's Microsoft 365
// tenant, then reads that mailbox through Graph until the code arrives. The
// registration is never completed, so no account is created: asking again
// only replaces the pending code. The message is deleted afterwards so the
// next run reads only its own.
//
// The monitor application is limited in Exchange (RBAC for Applications) to
// this one mailbox; it cannot read any other.
//
// Env: CED_URL, MONITOR_TENANT_ID, MONITOR_CLIENT_ID, MONITOR_CLIENT_SECRET,
//      TEST_MAILBOX

const env = (name) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

const site = env('CED_URL').replace(/\/+$/, '')
const mailbox = env('TEST_MAILBOX')
const deadline = Date.now() + 3 * 60_000

async function graphToken() {
  const response = await fetch(
    `https://login.microsoftonline.com/${env('MONITOR_TENANT_ID')}/oauth2/v2.0/token`, {
      method: 'POST',
      body: new URLSearchParams({
        client_id: env('MONITOR_CLIENT_ID'),
        client_secret: env('MONITOR_CLIENT_SECRET'),
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    })
  const body = await response.json()
  if (!body.access_token) throw new Error(`no Graph token: ${body.error_description ?? response.status}`)
  return body.access_token
}

const token = await graphToken()
const graph = async (method, path) => {
  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${mailbox}${path}`, {
    method, headers: { authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`Graph ${method} ${path}: ${response.status} ${await response.text()}`)
  return response.status === 204 ? null : response.json()
}

// Leftovers from a run that failed half way would satisfy this one.
const stale = await graph('GET', "/messages?$filter=from/emailAddress/address eq 'noreply@catstu.onmicrosoft.com'&$select=id&$top=50")
for (const message of stale.value) await graph('DELETE', `/messages/${message.id}`)

const options = await (await fetch(`${site}/api/v1/auth/options`)).json()
if (!options.verifiesEmail) throw new Error(`the deployment says it does not send mail: ${JSON.stringify(options)}`)

const started = new Date(Date.now() - 60_000).toISOString()
const registration = await fetch(`${site}/api/v1/auth/register`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  // Never used to sign in: the registration is left unfinished on purpose.
  body: JSON.stringify({ email: mailbox, password: `mail-check-${crypto.randomUUID()}` }),
})
if (registration.status !== 202) {
  throw new Error(`registration answered ${registration.status}: ${await registration.text()}`)
}
console.log(`registration started for ${mailbox}, waiting for the code`)

while (Date.now() < deadline) {
  const found = await graph('GET',
    `/messages?$filter=receivedDateTime ge ${started}&$select=id,subject,body,from,receivedDateTime&$top=5`)
  for (const message of found.value) {
    const code = message.body.content.match(/\b(\d{6})\b/)?.[1]
    if (code && /code/i.test(message.subject)) {
      const seconds = Math.round((Date.parse(message.receivedDateTime) - Date.parse(started)) / 1000) - 60
      console.log(`received "${message.subject}" from ${message.from.emailAddress.address} ` +
                  `about ${Math.max(seconds, 0)}s after the request, with a six-digit code`)
      await graph('DELETE', `/messages/${message.id}`)
      process.exit(0)
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 10_000))
}

throw new Error('no verification email arrived within three minutes')

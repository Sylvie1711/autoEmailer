import fs from "fs"
import readline from "readline"
import { google } from "googleapis"

console.log('syncing Emails to local Json');

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
const TOKEN_PATH = "token.json"

const creds = JSON.parse(fs.readFileSync("credentials.json"))
const { client_secret, client_id, redirect_uris } = creds.installed

const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
)

if (fs.existsSync(TOKEN_PATH)) {
  oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)))
  fetchSent()
} else {
  getNewToken()
}

function getNewToken() {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  })
  console.log("Authorize this app:", authUrl)

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  rl.question("Enter the code: ", (code) => {
    rl.close()
    oAuth2Client.getToken(code, (err, token) => {
      oAuth2Client.setCredentials(token)
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(token))
      fetchSent()
    })
  })
}

async function fetchSent() {
  const gmail = google.gmail({ version: "v1", auth: oAuth2Client })

  const res = await gmail.users.messages.list({
    userId: "me",
    labelIds: ["SENT"],
    maxResults: 500
  })

  const messages = res.data.messages || []
  let sentLog = {}

  for (const msg of messages) {
    const data = await gmail.users.messages.get({
      userId: "me",
      id: msg.id
    })

    const headers = data.data.payload.headers
    const to = headers.find(h => h.name === "To")?.value
    if (!to) continue

    to.split(",").forEach(email => {
      sentLog[email.trim()] = true
    })
  }

  fs.writeFileSync("sent.json", JSON.stringify(sentLog, null, 2))
  console.log("✅ Synced", Object.keys(sentLog).length, "sent emails")
}

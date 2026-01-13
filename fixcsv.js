import fs from "fs"

console.log("fixer started");
const raw = fs.readFileSync("EmailContacts.csv", "utf8")
const lines = raw.split("\n")

const output = []
output.push("srno,company,email,name")

const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i

for (let line of lines) {
  if (!line.trim()) continue
  if (line.includes("Email")) continue

  const emailMatch = line.match(emailRegex)
  if (!emailMatch) continue

  const email = emailMatch[0]

  const before = line.slice(0, line.indexOf(email)).trim()
  const after = line.slice(line.indexOf(email) + email.length).trim()

  // remove trailing comma
  const cleanBefore = before.replace(/,$/, "")

  const parts = cleanBefore.split(",")
  const srno = parts.shift()
  const company = parts.join(",").replace(/^"|"$/g, "").trim()

  const name = after.replace(/^,/, "").replace(/^"|"$/g, "").trim()

  output.push(
    `"${srno}","${company}","${email}","${name}"`
  )
}

fs.writeFileSync("EmailContacts_fixed.csv", output.join("\n"))
console.log("Fixed CSV written to EmailContacts_fixed.csv")

import { verifyEmail } from "./smtpVerifier.js"

// Test a few key emails that should be valid vs catch-all
const testEmails = [
  "harshk@elementsgs.com",    // Should be valid (was sent successfully)
  "bgl@astortech.com",        // Should be invalid 
  "sunilk@asmltd.com",        // Should be catch_all
  "dharmik@atlan.com",        // Should be invalid
  "mdixit@netrixllc.com"      // Should be valid (was sent successfully)
]

console.log('🔍 Quick test with fixed catch-all logic...\n')

for (const email of testEmails) {
  console.log(`\n📧 Testing: ${email}`)
  try {
    const result = await verifyEmail(email, { debug: true })
    console.log('\n📊 Final Result:')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`)
  }
}

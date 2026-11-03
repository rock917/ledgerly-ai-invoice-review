import { PlayCircle } from 'lucide-react'

export function WalkthroughVideo() {
  return <section className="panel walkthrough-video" id="quick-tour" aria-labelledby="quick-tour-title">
    <div className="panel-heading"><div><h2 id="quick-tour-title"><PlayCircle size={20} aria-hidden="true"/>Watch the quick tour</h2><p>From your first sample invoice to a recorded review.</p></div></div>
    <div className="walkthrough-content">
      <video controls playsInline preload="none" poster="/assets/tutorial/poster.jpg" aria-label="Ledgerly quick tour: sign in, upload a sample and review an invoice" aria-describedby="quick-tour-description">
        <source src="/assets/tutorial/ledgerly-walkthrough.webm" type="video/webm"/>
        Your browser cannot play this video. <a href="/assets/tutorial/ledgerly-walkthrough.webm">Download the walkthrough</a> or read the steps below.
      </video>
      <p id="quick-tour-description" className="field-help">About 1 minute · Captioned on screen · No sound needed · Staged tutorial with synthetic sample results. Actual processing time and outcomes vary with your documents and workspace history.</p>
      <details className="walkthrough-transcript"><summary>Read the walkthrough steps</summary><ol>
        <li>Sign in with Google, or create an email account and confirm your email. Each account opens a private demo workspace.</li>
        <li>Open <strong>New invoice → Try the sample walkthrough</strong>. Start with <strong>Approve a valid invoice</strong> in a fresh workspace.</li>
        <li>Select <strong>Use sample</strong>, check the filename, then click <strong>Start workflow</strong>. Selecting a sample alone does not upload it. Scanned PDFs take longer.</li>
        <li>Read the validation result. Expand rules to inspect vendor checks, duplicates and remaining PO balance. Compare extracted values and excerpts with the <strong>Original PDF</strong>.</li>
        <li>Under <strong>Human review</strong>, enter a meaningful note of at least five characters. Approve only after checking the evidence. Unresolved checks prevent approval; request information or reject when appropriate.</li>
        <li>Open <strong>Purchase orders</strong> to verify the balance. In this example, approving ₹60,000 against a ₹1,00,000 PO leaves ₹40,000. No payment is sent.</li>
        <li>Try the duplicate, overage, missing-information and OCR samples. Review outcomes depend on your workspace history. Final decisions stay in <strong>Run history</strong>.</li>
      </ol></details>
    </div>
  </section>
}

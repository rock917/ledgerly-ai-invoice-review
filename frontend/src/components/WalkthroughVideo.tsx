import { PlayCircle } from 'lucide-react'

export function WalkthroughVideo() {
  return <section className="panel walkthrough-video" id="quick-tour" aria-labelledby="quick-tour-title">
    <div className="panel-heading"><div><h2 id="quick-tour-title"><PlayCircle size={20} aria-hidden="true"/>Watch the quick tour</h2><p>Approve a valid invoice, then explore all three business edge cases.</p></div></div>
    <div className="walkthrough-content">
      <video controls playsInline preload="none" poster="/assets/tutorial/poster.jpg" aria-label="Ledgerly quick tour: invoice approval, duplicates, PO overage and missing information" aria-describedby="quick-tour-description">
        <source src="/assets/tutorial/ledgerly-walkthrough-narrated.mp4" type="video/mp4"/>
        <track kind="captions" src="/assets/tutorial/narration.vtt" srcLang="en" label="English narration"/>
        Your browser cannot play this video. <a href="/assets/tutorial/ledgerly-walkthrough-narrated.mp4">Download the walkthrough</a> or read the steps below.
      </video>
      <p id="quick-tour-description" className="field-help">About 3 minutes · AI voice narration in English · On-screen captions · Use the player controls to mute or turn on narration subtitles. Staged tutorial with synthetic sample results. Actual processing time and outcomes vary with your documents and workspace history.</p>
      <details className="walkthrough-transcript"><summary>Read the walkthrough steps</summary><ol>
        <li>Sign in with Google, or create an email account and confirm your email. Each account opens a private demo workspace.</li>
        <li>Open <strong>New invoice → Try the sample walkthrough</strong>. Start with <strong>Approve a valid invoice</strong> in a fresh workspace.</li>
        <li>Select <strong>Use sample</strong>, check the filename, then click <strong>Start workflow</strong>. Selecting a sample alone does not upload it. Scanned PDFs take longer.</li>
        <li>Read the validation result. Expand rules to inspect vendor checks, duplicates and remaining PO balance. Compare extracted values and excerpts with the <strong>Original PDF</strong>.</li>
        <li>Under <strong>Human review</strong>, enter a meaningful note of at least five characters. Approve only after checking the evidence. Unresolved checks prevent approval; request information or reject when appropriate.</li>
        <li>Open <strong>Purchase orders</strong> to verify the balance. In this example, approving ₹60,000 against a ₹1,00,000 PO leaves ₹40,000. No payment is sent.</li>
        <li>Download the sample ZIP for all five PDFs and test instructions. After the first approval, upload the renamed duplicate: the same vendor and invoice number should be <strong>Blocked</strong>.</li>
        <li>Upload the ₹45,000 overage sample. With ₹40,000 left on the PO, the system flags a ₹5,000 overage as <strong>Needs attention</strong>. A review note does not unlock approval.</li>
        <li>Upload the missing-number sample. <strong>Required information</strong> flags the absent invoice number. Add a note and choose <strong>Request information</strong>; the decision is saved without changing the accepted PO balance.</li>
        <li>Try the printed scan for OCR. Previous uploads and approvals affect repeat tests. Final decisions stay in <strong>Run history</strong>. All samples work without ERPNext.</li>
      </ol></details>
    </div>
  </section>
}

import { Download, FileText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from './ui/button'

export const demoSamples = [
  { file: '01-valid-partial-invoice.pdf', title: 'Approve a valid invoice', amount: '₹60,000', result: 'Ready for approval', description: 'Start with an unused sample invoice and at least ₹60,000 remaining on PO-2026-1001. Inspect the evidence, add a review note, and approve.' },
  { file: '03-duplicate-renamed.pdf', title: 'Catch a duplicate', amount: '₹60,000', result: 'Blocked', description: 'After step 1, upload this renamed copy. It has the same vendor and invoice number. The original must not be rejected.' },
  { file: '04-partial-invoice-overage.pdf', title: 'Check the remaining balance', amount: '₹45,000', result: 'Needs attention', description: 'After approving step 1 on a fresh PO, only ₹40,000 remains. This invoice exceeds that balance by ₹5,000, so approval is unavailable.' },
  { file: '02-missing-invoice-number.pdf', title: 'Request missing information', amount: '₹10,000', result: 'Needs attention', description: 'The invoice number is missing. Inspect the failed check, add a note, and choose Request information.' },
  { file: '06-scanned-invoice.pdf', title: 'Read a printed scan', amount: '₹5,000', result: 'OCR → review', description: 'This PDF contains an image without a text layer. Processing takes longer. Compare the extracted fields with the original before reviewing.' },
] as const

export function DemoGuide({ onSelect, disabled, loading }: { onSelect: (file: string) => void; disabled: boolean; loading: string | null }) {
  return <section className="panel demo-guide" id="sample-guide" aria-labelledby="demo-title">
    <div className="panel-heading"><div><h2 id="demo-title">Try the sample walkthrough</h2><p>Five synthetic PDFs. Use them in order to explore the workflow.</p></div><FileText size={23} aria-hidden="true"/></div>
    <div className="demo-intro"><ol className="demo-steps"><li><strong>1. Choose a sample</strong><span>Use it below, or download the PDF and upload it yourself.</span></li><li><strong>2. Start the workflow</strong><span>Inspect the extracted fields, source evidence, and checks.</span></li><li><strong>3. Record your review</strong><span>Add a note of at least 5 characters, then choose a decision.</span></li></ol>
    <p className="demo-context">New workspaces start with a ₹1,00,000 Northstar PO. These expected results assume fresh sample history and the order below. Previous uploads and approvals affect the results; downloading or selecting a sample does not reset anything. Check <Link to="/purchase-orders">Purchase orders</Link> and <Link to="/history">Run history</Link> if you have already tried these files.</p></div>
    <ol className="demo-samples">{demoSamples.map((sample, index) => <li key={sample.file} className="demo-sample">
      <div className="demo-sample-heading"><span className="demo-number" aria-hidden="true">{index + 1}</span><div><h3>{sample.title}</h3><p>{sample.amount} · Expected: {sample.result}</p></div></div>
      <p className="demo-description">{sample.description}</p>
      <div className="demo-actions"><Button size="sm" variant="outline" disabled={disabled} onClick={() => onSelect(sample.file)} aria-label={`Use sample: ${sample.title}`}>{loading === sample.file ? 'Loading PDF…' : 'Use sample'}</Button><a href={`/assets/samples/${sample.file}`} download={sample.file} aria-label={`Download PDF: ${sample.title}`}><Download size={15} aria-hidden="true"/>Download PDF</a></div>
    </li>)}</ol>
    <p className="demo-footnote">Selecting a sample only fills the upload form. Click Start workflow to process it. Each submitted PDF counts toward your account’s upload limit. AI results may vary; inspect every check. No payments are made.</p>
  </section>
}

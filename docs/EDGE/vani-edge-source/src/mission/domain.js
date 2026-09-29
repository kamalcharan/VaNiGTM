export const chapters = [
  ['Your context','Confirm what Edge knows'],['People & ownership','Meet the people doing the work'],
  ['Process & scope','Set the boundaries'],['Pain & desired gains','Understand what matters'],
  ['Your process board','Describe the work and exceptions'],['Rules & systems','Establish the operating context'],
  ['Evidence workspace','Prepare, attach and map evidence'],['Process explorer','See paths, waits and cases'],
  ['Findings & hypotheses','Explain and challenge the evidence'],['Readiness','Decide what is ready'],
  ['Value & controls','Compare the choices'],['Implementation brief','Take the next step']
];
export const packs = {
  p2p:{
    pains:['Month-end invoice backlog','Slow approvals','Invoices without POs','Late goods-receipt posting','Duplicate or wrong payments','Suppliers chasing payment status','Late supplier payments','Reconciliation mismatches'],
    gains:['Close books faster','Reduce approval effort','Pay suppliers on time','Reduce invoice rework','Improve supplier visibility','Capture available discounts'],
    follows:{
      'Month-end invoice backlog':['What usually holds up the close?',['Approval queues','Missing receipts','Reconciliation','Not sure']],
      'Slow approvals':['Who or what do approvals wait on?',['Finance Controller','CFO','Missing information','It varies']],
      'Invoices without POs':['Which purchases follow this route?',['Services','Urgent purchases','Multiple categories','Not sure']],
      'Late goods-receipt posting':['When is receipt usually recorded?',['Same day','1–3 days later','About a week later','Not sure']],
      'Duplicate or wrong payments':['What has your team actually encountered?',['Confirmed duplicates','Suspected duplicates','Incorrect amounts','No verified cases']],
      'Suppliers chasing payment status':['How do suppliers request updates?',['Email','Calls','WhatsApp','Several channels']],
      'Late supplier payments':['What most often prevents on-time payment?',['Approval pending','Cash scheduling','Dispute or missing documents','Not sure']],
      'Reconciliation mismatches':['Where does reconciliation break down?',['Invoice to PO','Receipt to invoice','Tax records','Not sure']]
    },
    rules:[['approval','Who approves purchases and invoices, and at what limits?','Include thresholds, currency, entity and delegated authority.'],['matching','What must match before an invoice can proceed?','Price and quantity tolerances; receipts required; allowed exceptions.'],['terms','How are payment dates agreed?','Supplier terms, acceptance dates and authorised exceptions.'],['po','When is a purchase order required?','Spend categories, thresholds, emergency purchases and exemptions.'],['receipt','When should goods receipts be recorded?','Time limit, responsible team and partial-delivery handling.']],
    activities:['Purchase requested','PO created','PO approved','Goods received','Receipt recorded','Invoice received','Invoice matched','Invoice approved','Payment released'],
    files:[
      ['ap','Invoice register','Invoice number, supplier ID, PO reference, amount, received / approved / paid dates','Tally / ERP / Excel','Connect invoice receipt to approval and payment.','csv,xlsx,xls'],
      ['po','Purchase-order register','PO number, supplier ID, creation date, value, approver and approval date','Purchasing system / ERP','Identify late POs and recorded approval paths.','csv,xlsx,xls'],
      ['grn','Goods-receipt register','Receipt ID, PO / invoice reference, arrival date, posting date, quantity','Warehouse system / ERP / Excel','Distinguish goods arrival from later recording.','csv,xlsx,xls'],
      ['vendor','Vendor master','Supplier ID, category, agreed terms and relevant status','Tally / ERP / Excel','Interpret terms and supplier-specific conditions.','csv,xlsx,xls'],
      ['history','Approval history','Invoice / PO ID, action, actor, timestamp and return reason','Workflow system / email export','Reconstruct returns, delegation and approval waits.','csv,xlsx,xls'],
      ['docs','Documents & policies','Representative invoices, receipt documents, approval matrix or SOP','Email / scanned documents / paper','Explain document handling and stated policy. Documents alone do not establish the full event history.','pdf,png,jpg,jpeg,eml']
    ]
  },
  o2c:{
    pains:['Delayed billing','Invoice disputes','Overdue collections','Unmatched customer receipts','Credit approval delays','Returns and credit notes','Manual collection follow-up','Missing delivery evidence'],
    gains:['Invoice customers sooner','Reduce disputes','Improve collection timing','Apply cash faster','Reduce follow-up effort','Improve customer experience'],
    follows:{
      'Delayed billing':['What usually prevents invoice creation?',['Delivery confirmation','Price approval','Manual entry','Not sure']],
      'Invoice disputes':['What do customers most often dispute?',['Price','Quantity / delivery','Terms','Multiple reasons']],
      'Overdue collections':['What blocks the next collection action?',['Dispute','No contact owner','Unallocated payment','Not sure']],
      'Unmatched customer receipts':['What information is missing from receipts?',['Invoice reference','Customer ID','Remittance advice','Not sure']],
      'Credit approval delays':['Who approves credit exceptions?',['Finance','Sales leadership','Credit committee','It varies']],
      'Returns and credit notes':['Where do credit notes wait?',['Return confirmation','Approval','Customer agreement','Not sure']],
      'Manual collection follow-up':['How are follow-ups tracked?',['Excel','Email','CRM','Not consistently']],
      'Missing delivery evidence':['Where is proof of delivery kept?',['Email','Logistics portal','Paper / images','Several places']]
    },
    rules:[['credit','Who authorises credit limits and exceptions?','Limits, authority and account holds.'],['billing','What triggers invoicing?','Dispatch, delivery, acceptance or milestones.'],['terms','How are customer payment terms agreed?','Due-date basis and exceptions.'],['dispute','What happens when an invoice is disputed?','Owner, reminder pause, resolution and escalation.'],['cash','How are receipts matched and adjustments approved?','Reference matching, tolerance, credit notes and write-offs.']],
    activities:['Order received','Credit reviewed','Order fulfilled','Delivery confirmed','Invoice issued','Collection follow-up','Receipt received','Cash applied'],
    files:[
      ['ap','Sales invoice register','Invoice ID, customer ID, order ID, amount, issue / due / paid dates','ERP / accounting / Excel','Establish billing and collection timing.','csv,xlsx,xls'],
      ['po','Sales-order register','Order ID, customer ID, order / fulfilment dates and value','ERP / CRM','Connect orders to fulfilment and billing.','csv,xlsx,xls'],
      ['grn','Customer receipts','Receipt ID, customer / invoice reference, date and applied amount','Bank reconciliation / accounting','See receipt timing and cash application.','csv,xlsx,xls'],
      ['vendor','Customer master','Customer ID, payment terms, credit limit and account owner','ERP / CRM','Interpret account-specific terms.','csv,xlsx,xls'],
      ['history','Disputes & collection history','Invoice ID, status, action, timestamp, reason and owner','CRM / shared tracker / email export','Identify dispute paths and repeated follow-up.','csv,xlsx,xls'],
      ['docs','Documents & policies','Invoices, delivery evidence, credit policy and sample correspondence','Email / PDF / images','Explain disputes and policy. Documents do not by themselves reveal all process events.','pdf,png,jpg,jpeg,eml']
    ]
  }
};
export const systems=['Tally','SAP / ERP','Excel','Email','CRM / workflow','Images / PDFs','Paper','Other'];
export const controlLabels={assist:'Assist the team',guarded:'Automate within agreed limits',extend:'Explore wider coverage after validation'};

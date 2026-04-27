export const users = [
  { name: 'Sarah Johnson', role: 'Closer', status: 'Active', calls: 23, talkTime: '4h 32m', demos: 6, conversion: '26.1%' },
  { name: 'Mike Chen', role: 'SDR', status: 'Active', calls: 19, talkTime: '3h 48m', demos: 5, conversion: '26.3%' },
  { name: 'Emily Davis', role: 'Setter', status: 'Break', calls: 17, talkTime: '3h 15m', demos: 4, conversion: '23.5%' },
  { name: 'James Wilson', role: 'Closer', status: 'Active', calls: 21, talkTime: '4h 05m', demos: 5, conversion: '23.8%' },
  { name: 'Lisa Anderson', role: 'Support', status: 'Offline', calls: 15, talkTime: '2h 52m', demos: 3, conversion: '20.0%' },
]

export const leads = [
  { name: 'Olivia Harper', company: 'Northline Partners', source: 'Cold List', stage: 'Qualified', owner: 'Sarah Johnson', phone: '(305) 555-0181' },
  { name: 'Ethan Brooks', company: 'Vertex Roofing', source: 'Inbound Form', stage: 'Contacted', owner: 'Mike Chen', phone: '(702) 555-0145' },
  { name: 'Mason Reed', company: 'Crest Dental', source: 'Referral', stage: 'Proposal', owner: 'James Wilson', phone: '(404) 555-0138' },
  { name: 'Ava Turner', company: 'Halo Tax Group', source: 'Upload', stage: 'New', owner: 'Emily Davis', phone: '(214) 555-0102' },
  { name: 'Noah Bennett', company: 'Brightline HVAC', source: 'Reactivation', stage: 'Callback', owner: 'Sarah Johnson', phone: '(773) 555-0197' },
]

export const campaigns = [
  { name: 'Q2 Reactivation', type: 'Progressive', status: 'Live', list: 'Dormant Opportunities', agents: 6, connectRate: '18.4%' },
  { name: 'Solar Warm Leads', type: 'Manual', status: 'Paused', list: 'Inbound Solar', agents: 3, connectRate: '27.9%' },
  { name: 'Med Spa Renewals', type: 'Progressive', status: 'Live', list: 'Renewals April', agents: 4, connectRate: '21.7%' },
  { name: 'Insurance Callbacks', type: 'Preview', status: 'Draft', list: 'Callbacks', agents: 2, connectRate: '14.1%' },
]

export const lists = [
  { name: 'Dormant Opportunities', records: 1248, lastImport: 'Apr 22, 2026', source: 'CSV Upload', status: 'Healthy' },
  { name: 'Inbound Solar', records: 416, lastImport: 'Apr 21, 2026', source: 'Webhook', status: 'Healthy' },
  { name: 'Renewals April', records: 682, lastImport: 'Apr 18, 2026', source: 'Sync', status: 'Review' },
  { name: 'Callbacks', records: 91, lastImport: 'Apr 24, 2026', source: 'Manual', status: 'Healthy' },
]

export const searchResults = [
  { query: 'solar', match: 'Vertex Roofing', reason: 'Inbound solar estimate request', lastActivity: '14 min ago' },
  { query: 'callback', match: 'Brightline HVAC', reason: 'Requested callback for Friday afternoon', lastActivity: '32 min ago' },
  { query: 'tax', match: 'Halo Tax Group', reason: 'Owner requested pricing packet', lastActivity: '1h ago' },
]
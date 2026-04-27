export interface NavItem {
  label: string
  href: string
  badge?: string | number
  badgeVariant?: 'default' | 'hot'
  icon: string
}

export interface NavSection {
  label: string
  items: NavItem[]
  collapsible?: boolean
}

export const ICONS = {
  users: 'M5 6a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1 13c0-2.8 1.8-4.5 4-4.5s4 1.7 4 4.5M10 5a2 2 0 11.001 0M12 12c0-2-1-3.5-2.5-4',
  phone: 'M3 1.5C3 1.5 5 3.5 5 5.5c0 .8-.5 1.5-1 2l1.5 1.5c.5-.5 1.2-1 2-1 2 0 3.5 2 3.5 2L9.5 11.5C7 10 4.5 7.5 3 5L3 1.5z',
  megaphone: 'M12 3v8L7 9H3a2 2 0 010-4h4l5-2zM7 9v3',
  list: 'M1 3h12M1 7h12M1 11h8',
  inbox: 'M1 4h12l-2 7H3L1 4zM1 4L4 8h6l3-4',
  funnel: 'M1 2h12L8 8v5l-2-1V8L1 2z',
  chart: 'M1 10l3-4 3 2 3-5 3 2M1 12h12',
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Workspace',
    items: [
      { label: 'Lists', href: '/lists', icon: ICONS.list },
      { label: 'Dialer', href: '/dialer', icon: ICONS.phone },
    ],
  },
  {
    label: 'People',
    collapsible: true,
    items: [
      { label: 'All Users', href: '/users', icon: ICONS.users },
      { label: 'User Stats', href: '/users/statistics', icon: ICONS.chart },
      { label: 'All Leads', href: '/leads', icon: ICONS.inbox },
      { label: 'Search Leads', href: '/leads/search', icon: ICONS.funnel },
    ],
  },
  {
    label: 'Outreach',
    collapsible: true,
    items: [
      { label: 'All Campaigns', href: '/campaigns', icon: ICONS.megaphone },
      { label: 'Statistics', href: '/campaigns/stats', icon: ICONS.chart },
    ],
  },
]
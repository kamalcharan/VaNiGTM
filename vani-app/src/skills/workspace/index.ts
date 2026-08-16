import type { SkillModule } from '@/platform/registry';

const workspace: SkillModule = {
  id: 'workspace',
  name: 'Workspace',
  routes: [
    { id: 'accounts', label: 'Accounts', href: '/accounts', group: 'workspace', icon: '▣', status: 'planned',
      summary: 'Organisations you sell to or serve, with the agent activity attached to each.' },
    { id: 'contacts', label: 'Contacts', href: '/contacts', group: 'workspace', icon: '▢', status: 'planned',
      summary: 'People inside those accounts. Backed by contact-skill once wired.' },
    { id: 'orders', label: 'Orders & Invoices', href: '/orders', group: 'workspace', icon: '▥', status: 'planned',
      summary: 'Quote to cash. Arrives with the order-to-cash agent.' },
    { id: 'content', label: 'Content', href: '/content', group: 'workspace', icon: '▧', status: 'planned',
      summary: 'Assets agents draw on and produce.' },
  ],
};
export default workspace;

import { redirect } from 'next/navigation';
import { recipeRoutes } from '../lib/recipe-routes';

export default function HomePage() {
  const firstWired = recipeRoutes.find((r) => r.status === 'wired');
  redirect(firstWired?.path || '/client-list');
}

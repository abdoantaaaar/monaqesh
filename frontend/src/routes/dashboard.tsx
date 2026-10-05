import {createFileRoute} from '@tanstack/react-router';
import {DashboardPage} from '@/features/monaqesh/dashboard';
import {pageHead} from '@/features/monaqesh/metadata';
export const Route=createFileRoute('/dashboard')({head:()=>pageHead('Dashboard','Your courses, academic activity, and project progress in Monaqesh.'),component:DashboardPage});

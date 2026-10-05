import { createFileRoute } from '@tanstack/react-router';
import {LoginPage} from '@/features/monaqesh/login';
import {pageHead} from '@/features/monaqesh/metadata';
export const Route=createFileRoute('/')({head:()=>pageHead('Login','Sign in to Monaqesh, your university workspace for project discussion and evaluation.'),component:LoginPage});

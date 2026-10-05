import {createFileRoute} from '@tanstack/react-router';
import {GradingPage} from '@/features/monaqesh/grades';
import {pageHead} from '@/features/monaqesh/metadata';
export const Route=createFileRoute('/grading')({head:()=>pageHead('Grading','Review and save student assessment grades in your assigned courses.'),component:GradingPage});

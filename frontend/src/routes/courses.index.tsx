import {createFileRoute} from '@tanstack/react-router';
import {CoursesPage} from '@/features/monaqesh/courses';
import {pageHead} from '@/features/monaqesh/metadata';
export const Route=createFileRoute('/courses/')({head:()=>pageHead('My Courses','Explore your Monaqesh academic courses and assessments.'),component:CoursesPage});
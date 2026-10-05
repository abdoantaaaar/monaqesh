import {createFileRoute} from '@tanstack/react-router';
import {RegistrationPage} from '@/features/monaqesh/courses';
import {pageHead} from '@/features/monaqesh/metadata';
export const Route=createFileRoute('/registration')({head:()=>pageHead('Course Registration','Browse and register for your university courses.'),component:RegistrationPage});

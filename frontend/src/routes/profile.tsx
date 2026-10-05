import {createFileRoute} from '@tanstack/react-router';
import {ProfilePage} from '@/features/monaqesh/profile';
import {pageHead} from '@/features/monaqesh/metadata';
export const Route=createFileRoute('/profile')({head:()=>pageHead('My Profile','Your Monaqesh academic identity and university account information.'),component:ProfilePage});

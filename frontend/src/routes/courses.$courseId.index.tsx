import {createFileRoute} from '@tanstack/react-router';
import {CourseDetailsPage} from '@/features/monaqesh/course-details';
import {pageHead} from '@/features/monaqesh/metadata';
export const Route=createFileRoute('/courses/$courseId/')({head:()=>pageHead('Course Details','Course information, student assessments, and collaborative project teams in Monaqesh.'),component:CoursePage});
function CoursePage(){const {courseId}=Route.useParams();return <CourseDetailsPage courseId={courseId}/>;}

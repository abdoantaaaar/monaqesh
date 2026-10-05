import {createFileRoute} from '@tanstack/react-router';
import {GradeResultsPage} from '@/features/monaqesh/grades';
import {pageHead} from '@/features/monaqesh/metadata';
export const Route=createFileRoute('/courses/$courseId/grades/$assessmentId')({head:()=>pageHead('Assessment Results','Academic assessment results and teaching assistant grading workspace.'),component:ResultsPage});
function ResultsPage(){const {courseId,assessmentId}=Route.useParams();return <GradeResultsPage courseId={courseId} assessmentId={assessmentId}/>;}

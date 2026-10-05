import {createFileRoute} from '@tanstack/react-router';
import {ReportPage} from '@/features/monaqesh/report';
import {pageHead} from '@/features/monaqesh/metadata';
export const Route=createFileRoute('/reports/$teamId')({head:()=>pageHead('Project Discussion Report','A detailed academic project discussion report with individual evaluation and feedback.'),component:DiscussionReport});
function DiscussionReport(){const {teamId}=Route.useParams();return <ReportPage teamId={teamId}/>;}

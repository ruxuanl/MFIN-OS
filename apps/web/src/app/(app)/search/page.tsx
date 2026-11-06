import { EmptyWorkspace } from "@/components/empty-workspace";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "搜索" };
export default function SearchPage() { return <div className="page-shell"><PageHeader eyebrow="Universal search" title="搜索" description="未来统一检索岗位、申请、课程、材料、日程和报告。"/><EmptyWorkspace icon="search" title="搜索索引尚未建立" description="M1 只固定入口，不建立空索引或收集真实内容。" note="搜索必须继承原对象权限"/></div>; }

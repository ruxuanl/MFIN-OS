import { Icon } from "@/components/icon";
import { SubmitButton } from "@/components/operation-feedback";

export function LogoutButton({ iconOnly = false }: { iconOnly?: boolean }) {
  return (
    <form action="/auth/logout" method="post" className="logout-form">
      <SubmitButton
        className={iconOnly ? "icon-button logout-button" : "quiet-button logout-button-wide"}
        aria-label="退出登录"
        pendingLabel={iconOnly ? "" : "正在退出…"}
        title={iconOnly ? "退出登录" : undefined}
      >
        <Icon name="logout" size={iconOnly ? 17 : 16} />
        {iconOnly ? null : <span>退出当前设备</span>}
      </SubmitButton>
    </form>
  );
}

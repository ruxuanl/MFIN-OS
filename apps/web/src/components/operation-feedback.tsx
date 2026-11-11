"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function BusyLabel({ children }: { children: ReactNode }) {
  return (
    <span className="busy-label">
      <span aria-hidden="true" className="loading-spinner" />
      <span>{children}</span>
    </span>
  );
}

type SubmitButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "onClick"> & {
  children: ReactNode;
  pendingLabel?: ReactNode;
};

export function SubmitButton({
  children,
  pendingLabel = "正在处理…",
  disabled,
  type = "submit",
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const [submitted, setSubmitted] = useState(false);
  const observedPending = useRef(false);

  useEffect(() => {
    if (pending) {
      observedPending.current = true;
      return;
    }
    if (observedPending.current) {
      observedPending.current = false;
      setSubmitted(false);
    }
  }, [pending]);

  return (
    <button
      {...props}
      aria-busy={submitted || undefined}
      disabled={disabled || pending}
      type={type}
      onClick={(event) => {
        if (!disabled && event.currentTarget.form?.checkValidity() !== false) {
          setSubmitted(true);
        }
      }}
    >
      {submitted ? <BusyLabel>{pendingLabel}</BusyLabel> : children}
    </button>
  );
}

export function OperationLink({
  href,
  className,
  children,
  pendingLabel = "正在打开…",
  disabled = false
}: {
  href: string;
  className?: string;
  children: ReactNode;
  pendingLabel?: ReactNode;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);

  return (
    <Link
      aria-busy={pending || undefined}
      aria-disabled={disabled || pending}
      className={className}
      href={disabled ? "#" : href}
      onClick={(event) => {
        if (disabled || pending) {
          event.preventDefault();
          return;
        }
        setPending(true);
      }}
    >
      {pending ? <BusyLabel>{pendingLabel}</BusyLabel> : children}
    </Link>
  );
}

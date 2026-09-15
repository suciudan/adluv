"use client";

import type { ReactNode } from "react";
import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { ChevronDown, Trash2, UserPlus, Users, X } from "lucide-react";

import type { WorkspaceMemberSummary, WorkspaceSummary } from "@adluv/db";

import {
  addExistingUserToWorkspaceAction,
  createWorkspaceAction,
  deleteWorkspaceAction,
  listWorkspaceMembersAction,
  updateWorkspaceDetailsAction,
} from "../app/actions/workspaces";
import { AppButton } from "./app-ui";

const newWorkspaceSelectValue = "__new_workspace__";

function getWorkspaceRoutePath(pathname: string) {
  const match = pathname.match(/^\/w\/[^/]+(\/.*)?$/);
  return match ? match[1] || "/ads" : pathname;
}

function navigateToWorkspace(workspaceSlug: string, href: string) {
  window.location.assign(`/w/${workspaceSlug}${href}`);
}

function InputField(props: {
  description?: string;
  label: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[13px] font-medium leading-5 text-[var(--text-secondary)]">{props.label}</span>
      {props.description ? <p className="text-[13px] leading-5 text-[var(--text-tertiary)]">{props.description}</p> : null}
      <input
        type="text"
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange?.(event.target.value)}
        className="app-input"
      />
    </label>
  );
}

export function WorkspaceManagementModal({
  workspace,
  workspaces,
  open,
  onOpenChange,
  triggerClassName,
  triggerChildren,
  onTriggerClick,
}: {
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerClassName?: string;
  triggerChildren?: ReactNode;
  onTriggerClick?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const routePathname = getWorkspaceRoutePath(pathname);
  const [isMounted, setIsMounted] = useState(false);
  const [internalOpen, setInternalOpen] = useState(false);
  const [workspaceDraft, setWorkspaceDraft] = useState({
    name: workspace.name,
    slug: workspace.slug,
  });
  const [newWorkspaceDraft, setNewWorkspaceDraft] = useState({
    name: "",
    slug: "",
  });
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [deleteWorkspaceOpen, setDeleteWorkspaceOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [memberIdentifier, setMemberIdentifier] = useState("");
  const [memberRole, setMemberRole] = useState<"member" | "admin">("member");
  const [members, setMembers] = useState<WorkspaceMemberSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isUpdatingWorkspace, startUpdatingWorkspace] = useTransition();
  const [isDeletingWorkspace, startDeletingWorkspace] = useTransition();
  const [isLoadingMembers, startLoadingMembers] = useTransition();
  const [isAddingMember, startAddingMember] = useTransition();
  const isOpen = open ?? internalOpen;
  const hasTrigger = Boolean(triggerClassName || triggerChildren);
  const canDeleteWorkspace = workspace.role === "owner" && workspaces.length > 1;
  const deleteConfirmationMatches = deleteConfirmation.trim() === workspace.slug;
  const setIsOpen = (nextOpen: boolean) => {
    onOpenChange?.(nextOpen);

    if (open === undefined) {
      setInternalOpen(nextOpen);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  useEffect(() => {
    setWorkspaceDraft({
      name: workspace.name,
      slug: workspace.slug,
    });
    setError(null);
    setNewWorkspaceOpen(false);
    setDeleteWorkspaceOpen(false);
    setDeleteConfirmation("");
  }, [workspace.id, workspace.name, workspace.slug]);

  useEffect(() => {
    if (!toastMessage) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setToastMessage(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    if (!isOpen || newWorkspaceOpen) {
      return;
    }

    startLoadingMembers(async () => {
      const response = await listWorkspaceMembersAction();

      if (response.status === "ok") {
        setMembers(response.members);
      }
    });
  }, [isOpen, newWorkspaceOpen, workspace.id]);

  const closeModal = () => {
    setIsOpen(false);
    setError(null);
    setWorkspaceDraft({ name: workspace.name, slug: workspace.slug });
    setNewWorkspaceDraft({ name: "", slug: "" });
    setNewWorkspaceOpen(false);
    setDeleteWorkspaceOpen(false);
    setDeleteConfirmation("");
    setMemberIdentifier("");
    setMemberRole("member");
  };

  const modal = isOpen ? (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-[var(--overlay)] px-3 py-3 sm:px-5 sm:py-6">
      <button type="button" aria-label="Close workspace management" className="absolute inset-0" onClick={closeModal} />
      <div className="mx-auto flex min-h-full items-start justify-center sm:items-center">
        <div className="app-modal-surface relative flex max-h-[calc(100vh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden p-4 sm:max-h-[calc(100vh-3rem)] sm:p-6">
          <div className="flex items-start justify-between gap-3 sm:gap-4">
            <div className="min-w-0 flex-1">
              <label className="grid w-full max-w-sm">
                <span className="sr-only">Workspace</span>
                <span className="relative block">
                  <select
                    value={newWorkspaceOpen ? newWorkspaceSelectValue : workspace.id}
                    onChange={(event) => {
                      if (event.target.value === newWorkspaceSelectValue) {
                        setError(null);
                        setNewWorkspaceOpen(true);
                        return;
                      }

                      const nextWorkspace = workspaces.find((item) => item.id === event.target.value);

                      if (!nextWorkspace) {
                        return;
                      }

                      if (nextWorkspace.id === workspace.id) {
                        setError(null);
                        setNewWorkspaceOpen(false);
                        return;
                      }

                      closeModal();
                      navigateToWorkspace(nextWorkspace.slug, routePathname);
                    }}
                    className="app-select appearance-none bg-none pr-12"
                  >
                    {workspaces.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                    <option value={newWorkspaceSelectValue}>New workspace</option>
                  </select>
                  <ChevronDown
                    size={18}
                    strokeWidth={1.9}
                    className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                  />
                </span>
              </label>
            </div>

            <button type="button" onClick={closeModal} className="app-icon-button" aria-label="Close">
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>

          {error ? (
            <p className="mt-5 rounded-[16px] border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </p>
          ) : null}

          <div className="app-scrollbar mt-6 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="grid gap-4">
              {!newWorkspaceOpen ? (
                <>
                  <form
                    className="min-w-0"
                    onSubmit={(event) => {
                      event.preventDefault();
                      startUpdatingWorkspace(async () => {
                        setError(null);
                        const response = await updateWorkspaceDetailsAction(workspaceDraft);

                        if (response.status === "error") {
                          setError(response.message);
                          return;
                        }

                        setToastMessage("Workspace updated.");

                        if (response.workspace?.slug && response.workspace.slug !== workspace.slug) {
                          navigateToWorkspace(response.workspace.slug, routePathname);
                        } else {
                          router.refresh();
                        }
                      });
                    }}
                  >
                    <div className="space-y-4">
                      <InputField
                        label="Workspace name"
                        value={workspaceDraft.name}
                        onChange={(value) => setWorkspaceDraft((current) => ({ ...current, name: value }))}
                      />
                      <InputField
                        label="Workspace URL"
                        value={workspaceDraft.slug}
                        onChange={(value) => setWorkspaceDraft((current) => ({ ...current, slug: value }))}
                        description="Use a short slug for the /w URL."
                      />
                      <AppButton type="submit" variant="primary" disabled={isUpdatingWorkspace}>
                        {isUpdatingWorkspace ? "Saving..." : "Save workspace"}
                      </AppButton>
                    </div>
                  </form>

                  <section className="border-t border-[var(--border-subtle)] pt-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                          <Users size={16} strokeWidth={1.9} />
                          Members
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-[var(--text-tertiary)]">
                          Invite existing adluv users into this workspace.
                        </p>
                      </div>
                    </div>

                    <form
                      className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_auto]"
                      onSubmit={(event) => {
                        event.preventDefault();
                        startAddingMember(async () => {
                          setError(null);
                          const response = await addExistingUserToWorkspaceAction({
                            identifier: memberIdentifier,
                            role: memberRole,
                          });

                          if (response.status === "error") {
                            setError(response.message);
                            return;
                          }

                          setMembers(response.members);
                          setMemberIdentifier("");
                          setToastMessage("Workspace member added.");
                        });
                      }}
                    >
                      <label className="grid gap-2">
                        <span className="text-[13px] font-medium leading-5 text-[var(--text-secondary)]">Email or username</span>
                        <input
                          type="text"
                          value={memberIdentifier}
                          onChange={(event) => setMemberIdentifier(event.target.value)}
                          className="app-input"
                          placeholder="name@company.com"
                        />
                      </label>
                      <label className="grid gap-2">
                        <span className="text-[13px] font-medium leading-5 text-[var(--text-secondary)]">Role</span>
                        <select
                          value={memberRole}
                          onChange={(event) => setMemberRole(event.target.value === "admin" ? "admin" : "member")}
                          className="app-select"
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      </label>
                      <AppButton type="submit" variant="secondary" disabled={isAddingMember || !memberIdentifier.trim()} className="self-end">
                        <UserPlus size={16} strokeWidth={1.9} />
                        {isAddingMember ? "Adding..." : "Add"}
                      </AppButton>
                    </form>

                    <div className="mt-4 overflow-hidden rounded-lg border border-[var(--border-subtle)]">
                      {isLoadingMembers && !members.length ? (
                        <p className="px-4 py-3 text-sm text-[var(--text-tertiary)]">Loading members...</p>
                      ) : (
                        members.map((member) => (
                          <div
                            key={member.id}
                            className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] px-4 py-3 last:border-b-0"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                                {member.name || member.username || member.email}
                              </p>
                              <p className="truncate text-[13px] leading-5 text-[var(--text-tertiary)]">{member.email}</p>
                            </div>
                            <span className="shrink-0 rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-[11px] font-semibold uppercase leading-4 text-[var(--text-secondary)]">
                              {member.role}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  <section className="border-t border-white/10 pt-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-red-100">Delete workspace</h3>
                        <p className="mt-1 text-sm leading-6 text-[var(--text-tertiary)]">
                          This removes workspace members, watchlist, saved ads, and notifications.
                        </p>
                      </div>
                      {!deleteWorkspaceOpen ? (
                        <AppButton
                          type="button"
                          variant="destructive"
                          className="w-full gap-2 sm:w-auto"
                          disabled={!canDeleteWorkspace || isDeletingWorkspace}
                          onClick={() => {
                            setError(null);
                            setDeleteWorkspaceOpen(true);
                          }}
                        >
                          <Trash2 size={16} strokeWidth={1.8} />
                          Delete
                        </AppButton>
                      ) : null}
                    </div>

                    {!canDeleteWorkspace ? (
                      <p className="mt-3 text-sm leading-6 text-[var(--text-tertiary)]">
                        {workspace.role === "owner"
                          ? "Create another workspace before deleting this one."
                          : "Only the workspace owner can delete this workspace."}
                      </p>
                    ) : null}

                    {deleteWorkspaceOpen ? (
                      <form
                        className="mt-4 space-y-4"
                        onSubmit={(event) => {
                          event.preventDefault();
                          startDeletingWorkspace(async () => {
                            setError(null);
                            const response = await deleteWorkspaceAction({
                              confirmation: deleteConfirmation,
                            });

                            if (response.status === "error") {
                              setError(response.message);
                              return;
                            }

                            closeModal();
                            navigateToWorkspace(response.workspace.slug, "/ads");
                          });
                        }}
                      >
                        <InputField
                          label={`Type ${workspace.slug} to confirm`}
                          value={deleteConfirmation}
                          onChange={setDeleteConfirmation}
                        />
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <AppButton
                            type="submit"
                            variant="destructive"
                            disabled={!deleteConfirmationMatches || isDeletingWorkspace}
                          >
                            {isDeletingWorkspace ? "Deleting..." : "Delete"}
                          </AppButton>
                          <AppButton
                            type="button"
                            variant="ghost"
                            disabled={isDeletingWorkspace}
                            onClick={() => {
                              setDeleteWorkspaceOpen(false);
                              setDeleteConfirmation("");
                            }}
                          >
                            Cancel
                          </AppButton>
                        </div>
                      </form>
                    ) : null}
                  </section>
                </>
              ) : null}

              {newWorkspaceOpen ? (
                <form
                  className="min-w-0"
                  onSubmit={(event) => {
                    event.preventDefault();
                    startUpdatingWorkspace(async () => {
                      setError(null);
                      const response = await createWorkspaceAction(newWorkspaceDraft);

                      if (response.status === "error") {
                        setError(response.message);
                        return;
                      }

                      closeModal();
                      navigateToWorkspace(response.workspace.slug, "/ads");
                    });
                  }}
                >
                  <div className="space-y-4">
                    <InputField
                      label="Name"
                      value={newWorkspaceDraft.name}
                      onChange={(value) => setNewWorkspaceDraft((current) => ({ ...current, name: value }))}
                      placeholder="Client or brand name"
                    />
                    <InputField
                      label="URL slug"
                      value={newWorkspaceDraft.slug}
                      onChange={(value) => setNewWorkspaceDraft((current) => ({ ...current, slug: value }))}
                      placeholder="optional"
                    />
                    <AppButton type="submit" variant="secondary" disabled={isUpdatingWorkspace}>
                      Create workspace
                    </AppButton>
                  </div>
                </form>
              ) : null}
            </div>

          </div>
        </div>
      </div>

      {toastMessage ? (
        <div className="fixed bottom-4 left-4 right-4 z-[90] rounded-[18px] border border-[rgba(16,185,129,0.22)] bg-[var(--bg-surface-1)] px-4 py-3 text-[13px] font-medium leading-5 text-[#a7f3d0] shadow-[var(--shadow-overlay)] sm:bottom-5 sm:left-auto sm:right-5 sm:w-[360px]">
          {toastMessage}
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <>
      {hasTrigger ? (
        <button
          type="button"
          onClick={() => {
            onTriggerClick?.();
            setIsOpen(true);
          }}
          className={triggerClassName}
        >
          {triggerChildren ?? "Manage workspaces"}
        </button>
      ) : null}

      {isMounted && modal ? createPortal(modal, document.body) : null}
    </>
  );
}

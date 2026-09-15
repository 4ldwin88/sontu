import { Building2, ChevronLeft, ImagePlus, Pencil, Plus, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, StatusBadge, TextField } from "../../../packages/ui-web";
import {
  createOrganization,
  organizationDetail,
  organizationGovernanceCommand,
  organizationGovernanceDetail,
  organizationMemberCommand,
  organizationOverview,
  type OrganizationContext,
  type OrganizationMember,
  type OrganizationSuccessor,
  type OrganizationType,
  type SuccessorRequest,
} from "../../../packages/data/sontu";
import { Modal } from "./shells";

const roleLabel = (role: OrganizationMember["role"]) =>
  role === "OWNER" ? "Owner" : role === "ADMIN" ? "Admin" : "Member";

export function OrganizationsPage({ onBack }: { onBack: () => void }) {
  const [organizations, setOrganizations] = useState<OrganizationContext[]>([]);
  const [params] = useSearchParams();
  const [selected, setSelected] = useState<string | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [successors, setSuccessors] = useState<OrganizationSuccessor[]>([]);
  const [requests, setRequests] = useState<SuccessorRequest[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [canGovern, setCanGovern] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [successorOpen, setSuccessorOpen] = useState(false);
  const [retireOpen, setRetireOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [successorEmail, setSuccessorEmail] = useState("");
  const [retireConfirmation, setRetireConfirmation] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<OrganizationType>("BUSINESS");
  const [editDescription, setEditDescription] = useState("");
  const [editVisibility, setEditVisibility] = useState<"PUBLIC" | "PRIVATE">("PRIVATE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(params.get("setup") === "pending" ? "Organization saved. It activates after the nominated successor accepts." : "");

  async function loadList(preferred?: string) {
    const result = await organizationOverview();
    if (result.status !== "ready") throw new Error();
    setOrganizations(result.organizations ?? []);
    setRequests(result.requests ?? []);
    setSelected(preferred ?? params.get("organization") ?? selected ?? result.organizations?.[0]?.id ?? null);
  }
  async function loadDetail(id: string) {
    const [memberResult, governanceResult] = await Promise.all([organizationDetail(id), organizationGovernanceDetail(id)]);
    if (memberResult.status !== "ready" || !memberResult.organization || governanceResult.status !== "ready" || !governanceResult.organization) throw new Error();
    setMembers(memberResult.members ?? []);
    setSuccessors(governanceResult.successors ?? []);
    setCanManage(memberResult.organization.can_manage);
    setCanGovern(governanceResult.organization.can_govern);
  }
  useEffect(() => {
    loadList().catch(() => setError("Could not load your organizations."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (selected) loadDetail(selected).catch(() => setError("Could not load this organization."));
    else {
      setMembers([]);
      setSuccessors([]);
      setCanManage(false);
      setCanGovern(false);
    }
  }, [selected]);

  async function mutate(action: "add_member" | "update_member" | "remove_member", input: Record<string, unknown>) {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    const requestId = crypto.randomUUID();
    try {
      const result = await organizationMemberCommand(action, selected, input, requestId);
      if (result.status !== "ready") {
        setError(result.error_code === "ACCOUNT_NOT_FOUND" ? "That email does not belong to a Sontu account yet." : "You do not have permission to make that change.");
        return;
      }
      await Promise.all([loadDetail(selected), loadList(selected)]);
      if (action === "add_member") {
        setEmail("");
        setInviteOpen(false);
      }
    } catch {
      setError("The change could not be confirmed. Refresh before trying again.");
    } finally {
      setBusy(false);
    }
  }

  async function govern(action: "update" | "nominate_successor" | "respond_successor" | "revoke_successor" | "retire", organizationId: string, input: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await organizationGovernanceCommand(action, organizationId, input, crypto.randomUUID());
      if (result.status !== "ready") {
        const messages: Record<string, string> = {
          ACCOUNT_NOT_FOUND: "That email does not belong to a verified Sontu account yet.",
          SELF_SUCCESSOR: "You cannot nominate yourself as your own successor.",
          FINAL_SUCCESSOR_REQUIRED: "Add and activate a replacement before removing the final accepted successor.",
          ORGANIZATION_HAS_ACTIVE_EVENTS: "Finish, cancel, or personally reassign every draft and published event before retiring this organization.",
          INVALID_CONFIRMATION: "Enter the organization name exactly to confirm retirement.",
        };
        setError(messages[result.error_code ?? ""] ?? "You do not have permission to make that change.");
        return;
      }
      if (action === "update") { setEditOpen(false); setNotice("Organization details updated."); }
      if (action === "nominate_successor") { setSuccessorOpen(false); setSuccessorEmail(""); setNotice("Successor request added. It grants no access unless and until succession is separately verified in the future."); }
      if (action === "respond_successor") setNotice(input.decision === "ACCEPT" ? "Successor designation accepted. The organization can now activate." : "Successor designation declined.");
      if (action === "retire") { setRetireOpen(false); setRetireConfirmation(""); setNotice("Organization retired. Its event history has been preserved."); }
      await Promise.all([loadList(organizationId), loadDetail(organizationId)]);
    } catch { setError("The change could not be confirmed. Refresh before trying again."); }
    finally { setBusy(false); }
  }

  const current = organizations.find((item) => item.id === selected);
  const statusLabel = current?.lifecycle === "SETUP_INCOMPLETE" ? "Setup incomplete" : current?.lifecycle === "CONTINUITY_ACTION_REQUIRED" ? "Successor needed" : current?.lifecycle === "RETIRED" ? "Retired" : "Active";
  function openEdit() {
    if (!current) return;
    setEditName(current.display_name); setEditType(current.organization_type ?? "OTHER");
    setEditDescription(current.description ?? ""); setEditVisibility(current.visibility ?? "PRIVATE"); setEditOpen(true);
  }
  return (
    <main id="main" tabIndex={-1} className="settings-page organizations-page">
      <button onClick={onBack} className="icon-button back-chevron" aria-label="Back to Profile">
        <ChevronLeft size={26} strokeWidth={2.5} />
      </button>
      <span className="eyebrow">One account · flexible context</span>
      <h1>Organizations</h1>
      <p className="muted">Manage the groups you act for without creating a separate Sontu account.</p>
      {requests.length > 0 && <section className="panel successor-requests"><h2>Successor requests</h2><p className="muted">Accepting records continuity intent. It does not give you current control or automatically transfer the organization later.</p>{requests.map((request) => <article key={request.id} className="member-row"><ShieldCheck size={20} /><div><strong>{request.organization_name}</strong><small>Priority {request.priority} successor</small></div><div className="member-actions"><Button disabled={busy} onClick={() => void govern("respond_successor", request.organization_id, { decision: "ACCEPT" })}>Accept</Button><Button disabled={busy} variant="quiet" onClick={() => void govern("respond_successor", request.organization_id, { decision: "DECLINE" })}>Decline</Button></div></article>)}</section>}
      {notice && <p role="status" className="coord-feedback">{notice}</p>}
      <div className="organization-layout">
        <aside className="panel organization-list">
          <div className="section-heading"><h2>Your organizations</h2><Link className="icon-button" aria-label="Set up organization" to="/organizations/new"><Plus size={20} /></Link></div>
          {organizations.length ? organizations.map((item) => (
            <button key={item.id} className={item.id === selected ? "organization-choice selected" : "organization-choice"} onClick={() => setSelected(item.id)}>
              <Building2 size={20} /><span><strong>{item.display_name}</strong><small>{roleLabel(item.role)} · {item.lifecycle === "ACTIVE" ? "Active" : item.lifecycle === "RETIRED" ? "Retired" : "Continuity action"}</small></span>
            </button>
          )) : <p className="muted">No organizations yet.</p>}
        </aside>
        <section className="panel organization-members">
          {current ? <>
            <div className="section-heading"><div><h2>{current.display_name}</h2><p className="muted">{statusLabel} · {current.visibility === "PUBLIC" ? "Public identity" : "Private identity"}</p></div><div className="member-actions">{canManage && current.lifecycle !== "RETIRED" && <Button variant="quiet" onClick={openEdit}><Pencil size={16} />Edit</Button>}{canManage && current.lifecycle === "ACTIVE" && <Button onClick={() => { setRole("MEMBER"); setInviteOpen(true); }}>Add member</Button>}</div></div>
            {current.lifecycle === "SETUP_INCOMPLETE" && <p className="coord-feedback">This organization cannot own new events until at least one nominated successor accepts.</p>}
            {current.lifecycle === "CONTINUITY_ACTION_REQUIRED" && <p className="coord-feedback">Add an accepted successor to complete the new continuity requirement. Existing operations remain available for now.</p>}
            <div className="member-list">
              {members.map((member) => (
                <article key={member.user_id} className="member-row">
                  <UserRound size={20} /><div><strong>{member.display_name}</strong><small>{member.email}</small></div><StatusBadge>{roleLabel(member.role)}</StatusBadge>
                  {canManage && member.role !== "OWNER" && <div className="member-actions">
                    {current.role === "OWNER" && <Button variant="quiet" disabled={busy} onClick={() => void mutate("update_member", { user_id: member.user_id, role: member.role === "ADMIN" ? "MEMBER" : "ADMIN" })}>{member.role === "ADMIN" ? "Make member" : "Make admin"}</Button>}
                    <Button variant="quiet" disabled={busy} onClick={() => void mutate("remove_member", { user_id: member.user_id })}>Remove</Button>
                  </div>}
                </article>
              ))}
            </div>
            {canGovern && <section className="organization-successors"><div className="section-heading"><div><h3>Continuity successors</h3><p className="small muted">Successors receive no present-day organization access from this designation.</p></div>{current.lifecycle !== "RETIRED" && <Button variant="secondary" onClick={() => setSuccessorOpen(true)}>Add successor</Button>}</div>{successors.length ? <div className="member-list">{successors.map((successor) => <article key={successor.id} className="member-row"><ShieldCheck size={20} /><div><strong>{successor.display_name}</strong><small>{successor.email} · Priority {successor.priority}</small></div><StatusBadge tone={successor.status === "ACCEPTED" ? "info" : "neutral"}>{successor.status === "ACCEPTED" ? "Accepted" : "Awaiting acceptance"}</StatusBadge>{current.lifecycle !== "RETIRED" && <Button variant="quiet" disabled={busy} onClick={() => void govern("revoke_successor", current.id, { nomination_id: successor.id })}>Remove</Button>}</article>)}</div> : <p className="muted">No successor is currently designated.</p>}{current.lifecycle !== "RETIRED" && <Button variant="quiet" onClick={() => setRetireOpen(true)}>Retire organization</Button>}</section>}
          </> : <><Building2 size={30} /><h2>Set up an organization</h2><p className="muted">Create a durable identity for a business, club, venue or group.</p><Link className="button primary" to="/organizations/new">Set up organization</Link></>}
        </section>
      </div>
      {error && <p role="alert">{error}</p>}
      {inviteOpen && <Modal title="Add organization member" onClose={() => !busy && setInviteOpen(false)}>
        <p>The person must already have a Sontu account. Members do not automatically control every event.</p>
        <TextField label="Account email" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
        {current?.role === "OWNER" && <label className="field"><span>Organization role</span><select value={role} onChange={(event) => setRole(event.target.value as "ADMIN" | "MEMBER")}><option value="MEMBER">Member</option><option value="ADMIN">Admin</option></select></label>}
        <div className="coord-actions"><Button disabled={busy || !email.trim()} onClick={() => void mutate("add_member", { email: email.trim(), role })}>{busy ? "Adding…" : "Add member"}</Button><Button variant="secondary" disabled={busy} onClick={() => setInviteOpen(false)}>Cancel</Button></div>
      </Modal>}
      {editOpen && current && <Modal title="Edit organization" onClose={() => !busy && setEditOpen(false)}><TextField label="Organization name" required maxLength={160} value={editName} onChange={(event) => setEditName(event.target.value)} /><label className="field"><span>Organization type</span><select value={editType} onChange={(event) => setEditType(event.target.value as OrganizationType)}>{organizationTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><TextField label="Short description (optional)" maxLength={500} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} /><fieldset className="visibility-options"><legend>Organization visibility</legend><label><input type="radio" checked={editVisibility === "PRIVATE"} onChange={() => setEditVisibility("PRIVATE")} /> Private</label><label><input type="radio" checked={editVisibility === "PUBLIC"} onChange={() => setEditVisibility("PUBLIC")} /> Public</label></fieldset><div className="coord-actions"><Button variant="secondary" disabled={busy} onClick={() => setEditOpen(false)}>Cancel</Button><Button disabled={busy || !editName.trim()} onClick={() => void govern("update", current.id, { display_name: editName.trim(), organization_type: editType, description: editDescription.trim(), visibility: editVisibility })}>{busy ? "Saving…" : "Save changes"}</Button></div></Modal>}
      {successorOpen && current && <Modal title="Add continuity successor" onClose={() => !busy && setSuccessorOpen(false)}><p>Choose another verified Sontu account. Nomination does not grant current access or cause automatic succession.</p><TextField label="Successor account email" type="email" required maxLength={254} value={successorEmail} onChange={(event) => setSuccessorEmail(event.target.value)} /><div className="coord-actions"><Button variant="secondary" disabled={busy} onClick={() => setSuccessorOpen(false)}>Cancel</Button><Button disabled={busy || !successorEmail.trim()} onClick={() => void govern("nominate_successor", current.id, { email: successorEmail.trim(), priority: successors.length + 1 })}>{busy ? "Adding…" : "Send request"}</Button></div></Modal>}
      {retireOpen && current && <Modal title="Retire organization" onClose={() => !busy && setRetireOpen(false)}><p>Retirement preserves the organization and its event history. It is blocked while the organization owns drafts or published events.</p><TextField label={`Enter ${current.display_name} to confirm`} required value={retireConfirmation} onChange={(event) => setRetireConfirmation(event.target.value)} /><div className="coord-actions"><Button variant="secondary" disabled={busy} onClick={() => setRetireOpen(false)}>Cancel</Button><Button variant="quiet" disabled={busy || retireConfirmation !== current.display_name} onClick={() => void govern("retire", current.id, { confirmation: retireConfirmation })}>{busy ? "Retiring…" : "Retire organization"}</Button></div></Modal>}
      <Link to="/events?view=hosting" className="text-action">View hosted events</Link>
    </main>
  );
}

const organizationTypes: { value: OrganizationType; label: string }[] = [
  { value: "BUSINESS", label: "Business" },
  { value: "NONPROFIT", label: "Nonprofit" },
  { value: "COMMUNITY", label: "Community or club" },
  { value: "VENUE", label: "Venue" },
  { value: "EDUCATION", label: "Educational institution" },
  { value: "GOVERNMENT", label: "Government" },
  { value: "OTHER", label: "Other" },
];

export function OrganizationSetupPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedReturn = params.get("return") ?? "/organizations";
  const returnTo = requestedReturn.startsWith("/") && !requestedReturn.startsWith("//") ? requestedReturn : "/organizations";
  const [name, setName] = useState("");
  const [type, setType] = useState<OrganizationType>("BUSINESS");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PRIVATE");
  const [successorEmail, setSuccessorEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const operation = useRef<string | null>(null);
  async function submit() {
    if (!name.trim() || !successorEmail.trim() || busy) return;
    setBusy(true);
    setError("");
    operation.current ??= crypto.randomUUID();
    try {
      const result = await createOrganization({ display_name: name.trim(), organization_type: type, description: description.trim(), visibility, successor_email: successorEmail.trim() }, operation.current);
      if (result.status !== "ready" || !result.organization) {
        if (result.error_code === "ACCOUNT_NOT_FOUND") setError("The successor must already have a verified Sontu account.");
        else if (result.error_code === "SELF_SUCCESSOR") setError("Choose someone other than yourself as the successor.");
        else throw new Error();
        return;
      }
      navigate(`/organizations?setup=pending&organization=${result.organization.id}`, { replace: true });
    } catch {
      setError("Organization setup is unconfirmed. Retry to safely check the same request.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main id="main" tabIndex={-1} className="settings-page organization-setup-page">
      <button onClick={() => navigate(returnTo)} className="icon-button back-chevron" aria-label="Cancel organization setup"><ChevronLeft size={26} strokeWidth={2.5} /></button>
      <span className="eyebrow">Organization identity</span>
      <h1>Set up your organization</h1>
      <p className="muted">Organizations stay attached to your existing personal Sontu account. Business and Enterprise are future service packages, not different organization types.</p>
      <section className="panel organization-setup-form">
        <TextField label="Organization name" required maxLength={160} value={name} onChange={(event) => { setName(event.target.value); operation.current = null; }} />
        <label className="field"><span>Organization type</span><select value={type} onChange={(event) => { setType(event.target.value as OrganizationType); operation.current = null; }}>{organizationTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <TextField label="Short description (optional)" maxLength={500} value={description} onChange={(event) => { setDescription(event.target.value); operation.current = null; }} />
        <fieldset className="visibility-options"><legend>Organization visibility</legend><label><input type="radio" checked={visibility === "PRIVATE"} onChange={() => { setVisibility("PRIVATE"); operation.current = null; }} /> Private</label><label><input type="radio" checked={visibility === "PUBLIC"} onChange={() => { setVisibility("PUBLIC"); operation.current = null; }} /> Public</label><p className="small muted">This controls organization identity visibility, not the visibility of its events.</p></fieldset>
        <Button type="button" variant="secondary" disabled><ImagePlus size={18} />Choose logo — coming later</Button>
        <aside className="organization-continuity-note"><strong>Continuity protection</strong><p>Choose at least one successor so your organization can continue if you can no longer manage it. They must accept before the organization can own events.</p></aside>
        <TextField label="Successor account email" type="email" required maxLength={254} value={successorEmail} onChange={(event) => { setSuccessorEmail(event.target.value); operation.current = null; }} />
        <p className="small muted">The successor must have a verified Sontu account and cannot be you. This grants no present-day access and never causes automatic transfer.</p>
        {error && <p role="alert">{error}</p>}
        <div className="coord-actions"><Button variant="secondary" disabled={busy} onClick={() => navigate(returnTo)}>Cancel</Button><Button disabled={busy || !name.trim() || !successorEmail.trim()} onClick={() => void submit()}>{busy ? "Saving…" : "Save organization setup"}</Button></div>
      </section>
    </main>
  );
}

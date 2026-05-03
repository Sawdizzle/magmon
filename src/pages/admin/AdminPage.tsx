import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Role = "admin" | "member" | "viewer";

type Company = { id: string; name: string };
type Member = {
  company_id: string;
  user_id: string;
  email: string;
  role: Role;
  created_at: string;
};

type Props = {
  supabase: SupabaseClient;
  currentUserId: string;
};

export function AdminPage({ supabase, currentUserId }: Props) {
  const [isAppAdmin, setIsAppAdmin] = useState<boolean>(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: adminRow } = await supabase
      .from("app_admins")
      .select("user_id")
      .eq("user_id", currentUserId)
      .maybeSingle();
    const isAdmin = !!adminRow;
    setIsAppAdmin(isAdmin);

    const { data: companyRows, error: companyErr } = await supabase
      .from("companies")
      .select("id, name")
      .order("name");
    if (companyErr) {
      setError(companyErr.message);
      setLoading(false);
      return;
    }
    setCompanies(companyRows ?? []);
    if (!selectedCompany && companyRows && companyRows.length > 0) {
      setSelectedCompany(companyRows[0].id);
    }
    setLoading(false);
  }, [supabase, currentUserId, selectedCompany]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedCompany) {
      setMembers([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error: err } = await supabase
        .from("v_company_members")
        .select("company_id, user_id, email, role, created_at")
        .eq("company_id", selectedCompany)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setMembers([]);
        return;
      }
      setMembers((data ?? []) as Member[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, selectedCompany, actionMsg]);

  const visibleCompanies = useMemo(() => {
    if (isAppAdmin) return companies;
    return companies;
  }, [isAppAdmin, companies]);

  async function handleAddMember(email: string, role: Role) {
    if (!selectedCompany) return;
    setError(null);
    setActionMsg(null);
    const { error: rpcErr } = await supabase.rpc("add_company_member", {
      p_company_id: selectedCompany,
      p_email: email,
      p_role: role,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setActionMsg(`Added ${email} as ${role}.`);
  }

  async function handleSetRole(userId: string, role: Role) {
    if (!selectedCompany) return;
    setError(null);
    setActionMsg(null);
    const { error: rpcErr } = await supabase.rpc("set_company_member_role", {
      p_company_id: selectedCompany,
      p_user_id: userId,
      p_role: role,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setActionMsg(`Updated role to ${role}.`);
  }

  async function handleRemove(userId: string) {
    if (!selectedCompany) return;
    if (!confirm("Remove this member's access to the company?")) return;
    setError(null);
    setActionMsg(null);
    const { error: rpcErr } = await supabase.rpc("remove_company_member", {
      p_company_id: selectedCompany,
      p_user_id: userId,
    });
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setActionMsg("Member removed.");
  }

  async function handleCreateCompany(id: string, name: string) {
    setError(null);
    setActionMsg(null);
    const { error: insErr } = await supabase.from("companies").insert({ id, name });
    if (insErr) {
      setError(insErr.message);
      return;
    }
    setActionMsg(`Created company ${name}.`);
    await refresh();
    setSelectedCompany(id);
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading admin…</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-sm text-muted-foreground">
          {isAppAdmin
            ? "App admin: manage all companies, members and roles."
            : "Customer admin: manage members of your own company."}
        </p>
      </header>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {actionMsg && (
        <div className="rounded border border-emerald-500/40 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {actionMsg}
        </div>
      )}

      {isAppAdmin && (
        <CompanyCreator onCreate={handleCreateCompany} />
      )}

      <section className="space-y-2">
        <label className="block text-sm font-medium">Company</label>
        <select
          className="w-full rounded border px-2 py-1.5 text-sm"
          value={selectedCompany ?? ""}
          onChange={e => setSelectedCompany(e.target.value)}
          data-testid="select-admin-company"
        >
          {visibleCompanies.map(c => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.id})
            </option>
          ))}
        </select>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Members</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1">Email</th>
              <th>Role</th>
              <th>Added</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-muted-foreground">
                  No members yet.
                </td>
              </tr>
            )}
            {members.map(m => (
              <tr key={m.user_id} className="border-t">
                <td className="py-1.5">{m.email}</td>
                <td>
                  <select
                    value={m.role}
                    onChange={e => void handleSetRole(m.user_id, e.target.value as Role)}
                    className="rounded border px-1 py-0.5 text-xs"
                    data-testid={`select-role-${m.user_id}`}
                  >
                    <option value="admin">admin</option>
                    <option value="member">member</option>
                    <option value="viewer">viewer</option>
                  </select>
                </td>
                <td className="text-muted-foreground">
                  {new Date(m.created_at).toLocaleDateString()}
                </td>
                <td className="text-right">
                  <button
                    className="rounded border px-2 py-0.5 text-xs hover:bg-muted"
                    onClick={() => void handleRemove(m.user_id)}
                    data-testid={`button-remove-${m.user_id}`}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <AddMemberForm onAdd={handleAddMember} />

        <p className="text-xs text-muted-foreground">
          Note: members must already have a Magmon account. The user signs up via the normal
          login screen first, then an admin grants access here. (To send invites without
          requiring prior signup, we'd need a server-side invite RPC using the Supabase
          service role.)
        </p>
      </section>
    </div>
  );
}

function CompanyCreator({ onCreate }: { onCreate: (id: string, name: string) => void | Promise<void> }) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  return (
    <section className="rounded border bg-muted/20 p-3">
      <h2 className="mb-2 text-sm font-medium">Create company</h2>
      <div className="flex flex-wrap gap-2">
        <input
          className="flex-1 rounded border px-2 py-1 text-sm"
          placeholder="company-id (slug)"
          value={id}
          onChange={e => setId(e.target.value)}
          data-testid="input-new-company-id"
        />
        <input
          className="flex-1 rounded border px-2 py-1 text-sm"
          placeholder="Display name"
          value={name}
          onChange={e => setName(e.target.value)}
          data-testid="input-new-company-name"
        />
        <button
          className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
          disabled={!id || !name}
          onClick={() => {
            void onCreate(id, name);
            setId("");
            setName("");
          }}
          data-testid="button-create-company"
        >
          Create
        </button>
      </div>
    </section>
  );
}

function AddMemberForm({ onAdd }: { onAdd: (email: string, role: Role) => void | Promise<void> }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  return (
    <div className="flex flex-wrap items-end gap-2 rounded border bg-muted/20 p-3">
      <div className="flex-1">
        <label className="mb-1 block text-xs text-muted-foreground">Email of registered user</label>
        <input
          type="email"
          className="w-full rounded border px-2 py-1 text-sm"
          value={email}
          onChange={e => setEmail(e.target.value)}
          data-testid="input-add-member-email"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">Role</label>
        <select
          className="rounded border px-2 py-1 text-sm"
          value={role}
          onChange={e => setRole(e.target.value as Role)}
          data-testid="select-add-member-role"
        >
          <option value="admin">admin</option>
          <option value="member">member</option>
          <option value="viewer">viewer</option>
        </select>
      </div>
      <button
        className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50"
        disabled={!email}
        onClick={() => {
          void onAdd(email, role);
          setEmail("");
        }}
        data-testid="button-add-member"
      >
        Add
      </button>
    </div>
  );
}

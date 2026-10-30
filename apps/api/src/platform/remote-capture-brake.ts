import { GoogleAuth } from 'google-auth-library';

// Agents run the capture job directly; the brake revokes their binding.

export type RemoteCaptureRevoker = () => Promise<{ removed: number }>;

interface IamPolicy {
  bindings?: { role: string; members?: string[] }[];
  etag?: string;
  version?: number;
}

export type IamRequest = (method: 'GET' | 'POST', url: string, body?: unknown) => Promise<unknown>;

// Drops the member everywhere, and any binding left empty.
export function withoutMember(policy: IamPolicy, member: string): { policy: IamPolicy; removed: number } {
  let removed = 0;
  const bindings = (policy.bindings ?? []).flatMap((binding) => {
    const members = (binding.members ?? []).filter((m) => m !== member);
    removed += (binding.members?.length ?? 0) - members.length;
    return members.length ? [{ ...binding, members }] : [];
  });
  return { policy: { ...policy, bindings }, removed };
}

export function createRemoteCaptureRevoker(job: string, member: string, request: IamRequest): RemoteCaptureRevoker {
  const base = `https://run.googleapis.com/v2/${job}`;
  return async () => {
    const current = (await request('GET', `${base}:getIamPolicy`)) as IamPolicy;
    const { policy, removed } = withoutMember(current, member);
    // The etag turns a concurrent edit into a failure, not an overwrite.
    if (removed) await request('POST', `${base}:setIamPolicy`, { policy });
    return { removed };
  };
}

// Job resource name plus IAM member; either unset means no revoker.
export function createRemoteCaptureRevokerFromEnv(env: NodeJS.ProcessEnv): RemoteCaptureRevoker | undefined {
  const job = env.REMOTE_CAPTURE_JOB?.trim();
  const member = env.REMOTE_CAPTURE_EXECUTOR?.trim();
  if (!job || !member) return undefined;
  if (!/^projects\/[a-z0-9-]+\/locations\/[a-z0-9-]+\/jobs\/[a-z0-9-]+$/.test(job)) return undefined;
  let auth: GoogleAuth | undefined;
  return createRemoteCaptureRevoker(job, member, async (method, url, body) => {
    auth ??= new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    const client = await auth.getClient();
    const res = await client.request({ method, url, data: body });
    return res.data;
  });
}

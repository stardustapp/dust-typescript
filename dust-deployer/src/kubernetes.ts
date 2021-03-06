import {
  clr,
  JSONObject,
  fromIngress,
  fromDeployment,
  DeploymentSpec,
  Container,
  PodSpec,
} from "../deps.ts";

export function generateIngress({
  serviceName, annotations, domains,
}: {
  serviceName: string;
  annotations?: Record<string,string>;
  domains: Array<string>;
}) {
  return fromIngress({
    metadata: {
      name: `${serviceName}-fe`,
      annotations,
    },
    spec: {
      tls: [{
        hosts: domains,
        secretName: `${serviceName}-tls`,
      }],
      rules: domains.map(domain => ({
        host: domain,
        http: {
          paths: [{
            path: '/',
            backend: {
              serviceName,
              servicePort: 'http',
            },
            // Ingress v1 in Kubernetes 1.19:
            // backend: {
            //   service: {
            //     name: serviceName,
            //     port: {
            //       name: 'http',
            //     },
            //   },
            // },
          }]},
      })),
    },
  }) as JSONObject;
}

export function generateDeploymentPatch(name: string, {
  deployment={},
  pod={},
  containerName='app',
  container={},
}: {
  deployment?: Partial<DeploymentSpec>,
  pod?: Partial<PodSpec>,
  containerName?: string,
  container?: Partial<Container>,
}) {
  return fromDeployment({
    metadata: { name },
    spec: {
      ...deployment,
      selector: {},
      template: { spec: {
        ...pod,
        containers: [{
          name: containerName,
          ...container,
        }],
      }},
    },
  }) as JSONObject;
}

export class KubernetesClient {
  context: string;
  namespace: string;
  constructor(context: string, namespace: string) {
    this.context = context;
    this.namespace = namespace;
  }

  execKubectl(args: string[]) {
    // TODO: talk directly to kubernetes
    const proc = Deno.run({
      cmd: [
        `kubectl`,
        '--context', this.context,
        '--namespace', this.namespace,
        ...args,
      ],
      stdout: 'piped',
    });
    return proc.output().then(x => new TextDecoder('utf-8').decode(x).trim());
  }

  async pollForPodStability(labels: Record<string,string>) {
    const labelStr = Object.keys(labels)
      .map(x => `${x}=${labels[x]}`)
      .join(',');

    const seenPods = new Map;
    while (true) {
      await new Promise(ok => setTimeout(ok, 5000));

      // Dumbly parse the kubectl stdout
      const stdout = await this.execKubectl([
        'get', 'pods', '-l', labelStr]);
      const allPods = stdout.split(`\n`).slice(1).map(x => {
        const [name, running, status, restarts, age] = x.split(/ +/);
        return {name, running, status, restarts, age};
      }).filter(x => x.running.includes('/'));

      // List all pods that aren't fully Ready
      const badPods = allPods.filter(x => {
        if (x.status !== 'Running') return true;
        const [_, ready, total] = x.running.match(/^(\d+)\/(\d+)$/) ?? ['','',''];
        if (ready !== total) return true;
        return false;
      });

      if (badPods.length === 0) {
        // All good :)
        return allPods;
      }

      for (const pod of badPods) {
        // Check if the pod's health changed
        const healthStr = [
          pod.running,
          pod.status,
          pod.restarts,
        ].join(',');
        if (seenPods.get(pod.name) === healthStr) continue;
        seenPods.set(pod.name, healthStr);

        // Log the new pod health
        let statusStr = (({
          Pending: clr.cyan,
          ContainerCreating: clr.cyan,
          Running: clr.green,
          Terminating: clr.yellow,
        } as Record<string, (a:string) => string>)[pod.status] || clr.red)(pod.status);
        statusStr += ` (${pod.running} ready`;
        if (pod.restarts !== '0') {
          statusStr += `, ${clr.red(pod.restarts+' restarts')}`;
        }
        statusStr += `, ${clr.bold(pod.age)} old)`;
        console.log('   ', clr.cyan(pod.name), 'is now', statusStr);
      }
    }
  }
};

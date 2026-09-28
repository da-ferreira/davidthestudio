// Ponte stdio → socket das ferramentas do studio. O agente sobe este script como servidor MCP;
// quem responde é o daemon, do outro lado do socket. Sem dependências: roda também dentro do container.
import net from 'node:net'

const socket = net.connect(process.argv[2])
process.stdin.pipe(socket)
socket.pipe(process.stdout)
socket.on('error', (err) => {
  process.stderr.write(`studio: ${err.message}\n`)
  process.exit(1)
})
socket.on('close', () => process.exit(0))

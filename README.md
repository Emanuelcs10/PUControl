# PU Control — versão gratuita para GitHub Pages

Aplicação estática para controle de perdas de PU, com cadastros de modelos/máquinas, materiais, usuários, histórico e importação/exportação de banco Excel.

## Publicar gratuitamente no GitHub Pages

1. Crie um repositório no GitHub (por exemplo, `pu-control`).
2. Envie `index.html` e este `README.md` para a raiz do repositório.
3. Abra **Settings → Pages**.
4. Em **Build and deployment**, selecione **Deploy from a branch**.
5. Escolha a branch `main` e a pasta `/ (root)`, depois salve.
6. Aguarde a publicação e abra o endereço mostrado pelo GitHub Pages.

## Banco de dados Excel

Entre como administrador, abra **Banco Excel** e use **Baixar banco Excel (.xlsx)** para exportar os cadastros e as perdas. Para transferir dados a outro computador, importe esse arquivo no outro navegador.

**Limitação importante:** GitHub Pages é hospedagem estática e não grava diretamente no arquivo Excel do repositório. O navegador guarda dados localmente. A transferência entre dispositivos é manual por arquivo Excel; não há sincronização simultânea. As fotos das perdas não entram no Excel. Senhas não são exportadas; ao importar, senhas de usuários já existentes no navegador são preservadas e novos usuários precisam de senha preenchida na coluna `password`.

A biblioteca de Excel é carregada por CDN, portanto a importação/exportação `.xlsx` exige conexão com a internet.

## Acesso demonstrativo

- Administrador: `admin` / `admin123`
- Operador: `operador` / `op123`
- Consulta: `consulta` / `consulta123`

Troque esses acessos antes de qualquer uso real. Este protótipo não é adequado para dados confidenciais nem oferece autenticação segura no servidor.


## Atualização: usuários reais
Consulte `LEIA-ME-USUARIOS.md`. O menu Banco Excel foi removido. Para cadastrar contas pelo sistema, execute `MIGRACAO_USUARIOS.sql` e publique a Edge Function `admin-users`.

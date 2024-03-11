---
title: 炼丹炉被黑始末 (a.k.a. 这下服务器变回转寿司了，最美味的一集)
date: 2024-02-28
---

炼丹炉被黑了，以下是事情经过：

## 流水账

- 2024/2/27：师兄发现在实验室服务器上登陆的网络通被网络信息中心留言：
  ```
  您好！

  您使用的IP地址 xxx.xxx.xx.xxx 存在通信异常行为，
  请尽快对系统进行处理，否则网络信息中心中心将暂停该机的对外通信。

  科大网络信息中心 (联系方式略)

  异常行为：
  xxx.xxx.xx.xx大量查询域名ircx.us.too,怀疑该IP已被入侵并被远程控制。
  ```
  留言共有两条：分别为 2024/2/21 20:44 和 2024/2/27 09:31 所留，均提示高频的 IRC 服务器域名 DNS 查询。

  我简单用 `tcpdump -i lo port 53` 看了一下，发现了一秒钟多次的 DNS 查询。因为使用了 `systemd-resolved`，DNS 服务器为 systemd 的 127.0.0.53，故可以在本地回环链路上观察到。

  经过观察，主要有到 `ircx.us.to`, `irc.dal.net`, `irc.undernet.org` 三个域名的查询，每秒查询超过 100 次。

  显然，服务器应该是被黑了。
- 2024/2/28：在 @taoky 的帮助下进行了比较详尽的调查，花费了一个晚上。

## 情况介绍

该服务器位于科大校园网内，以 100Mbps 以太网链路接入管科楼，拥有学校的 IPv4 和 IPv6 地址，没有专门的网络通，需要上网时同学会登陆自己的网络通账号。

服务器为 Ubuntu 20.04 LTS，插有 10 (9?) 块 RTX3090 显卡。平常同学们通过 ssh 公钥登陆，或通过 (密码 + TOTP Code) 进行登陆（采用 `libpam-google-authenticator`，参考 [link](https://ubuntu.com/tutorials/configure-ssh-2fa#2-installing-and-configuring-required-packages)）。

服务器共有 25 个用户，其中 5 个拥有 sudo 权限，3 个位于 docker 组。Docker daemon 运行在 root。

利用 `netstat -nlp` 可以看到上面有 pgyvpn，ZeroTier 等程序。

## 分析过程

大概的分析时间线如下：

### 确定哪个进程在发出 DNS 请求

```
$ sudo netstat -np | grep 127.0.0.53:53 | grep udp
udp        0      0 127.0.0.1:41511         127.0.0.53:53           ESTABLISHED -                   
udp      768      0 127.0.0.1:43814         127.0.0.53:53           ESTABLISHED 5973/./nobody       
udp        0      0 127.0.0.1:44384         127.0.0.53:53           ESTABLISHED -                   
udp        0      0 127.0.0.1:46012         127.0.0.53:53           ESTABLISHED 1989649/[           
udp      768      0 127.0.0.1:52710         127.0.0.53:53           ESTABLISHED 5975/./nobody       
udp        0      0 127.0.0.1:55295         127.0.0.53:53           ESTABLISHED 1989647/[           
udp      768      0 127.0.0.1:55728         127.0.0.53:53           ESTABLISHED 5976/./nobody       
udp        0      0 127.0.0.1:55801         127.0.0.53:53           ESTABLISHED 1986059/[kwor       
udp        0      0 127.0.0.1:56095         127.0.0.53:53           ESTABLISHED -                   
udp        0      0 127.0.0.1:57082         127.0.0.53:53           ESTABLISHED 2178005/[           
udp        0      0 127.0.0.1:58772         127.0.0.53:53           ESTABLISHED -                   
udp        0      0 127.0.0.1:59061         127.0.0.53:53           ESTABLISHED 1995387/[           
udp        0      0 127.0.0.1:59165         127.0.0.53:53           ESTABLISHED 1986012/[           
udp        0      0 127.0.0.1:60684         127.0.0.53:53           ESTABLISHED -                   
```

可以看到怀疑对象有 PID 为 5976 和 1989649 等几个进程。

不过，登登登登：

```
$ sudo ps aux | grep 5975
lzt        40314  0.0  0.0  19764  2856 pts/11   S+   22:41   0:00 grep --color=auto 5975
```

这要拜 Rootkit 所赐，因为 `/etc/ld.so.preload` 里面加入了一些内容。不过也没事，可以用静态链接的 busybox 来看：

```
$ sudo ./busybox cat /etc/ld.so.preload
/usr/local/lib/dbus-collector/libdbus_x86_64.so
/usr/local/lib/network.so
$ sudo ./busybox ps aux | grep 5975
 5975 zx        5:43 ./nobody nmop
44054 lzt       0:00 grep --color=auto 5975
$ sudo ./busybox readlink -f /proc/5975/exe
/home/zx/.cpan/nobody
```

仔细检查，共有下面的用户拥有 .cpan：
```
/home/spf/.cpan
/home/xy/.cpan
/home/zx/.cpan
```

另外观察一下另外几个进程：
```
$ sudo ./busybox readlink -f /proc/1986059/exe
/usr/bin/crond
$ sudo ./busybox readlink -f /proc/1989647/exe
/usr/bin/a
# 下同
```

## cron 日志暴露的内容

另外，在 journalctl 的 cron 条目里面可以额外发现一些信息：

<details>
  <summary>太长了，点这里观看</summary>

```
2月 28 22:53:01 GPU crontab[62015]: (yyy) LIST (yyy)
2月 28 22:54:01 GPU crontab[63492]: (yyy) LIST (yyy)
2月 28 22:55:01 GPU CRON[65423]: pam_unix(cron:session): session opened for user root by (uid=0)
2月 28 22:55:01 GPU CRON[65424]: pam_unix(cron:session): session opened for user root by (uid=0)
2月 28 22:55:01 GPU CRON[65427]: (root) CMD (/root/.cpan/.cache/update >/dev/null 2>&1)
2月 28 22:55:01 GPU CRON[65426]: pam_unix(cron:session): session opened for user yyy by (uid=0)
2月 28 22:55:01 GPU CRON[65425]: pam_unix(cron:session): session opened for user xy by (uid=0)
2月 28 22:55:01 GPU CRON[65428]: (root) CMD (/.dbus/auto >/dev/null 2>&1)
2月 28 22:55:01 GPU CRON[65429]: (yyy) CMD (/dev/shm/.m-1013/dbus-collector.seed)
2月 28 22:55:01 GPU CRON[65430]: (xy) CMD (/home/xy/.cpan/.cache/update >/dev/null 2>&1)
2月 28 22:55:01 GPU CRON[65423]: pam_unix(cron:session): session closed for user root
2月 28 22:55:01 GPU CRON[65424]: pam_unix(cron:session): session closed for user root
2月 28 22:55:01 GPU crontab[65438]: (yyy) LIST (yyy)
2月 28 22:55:01 GPU CRON[65425]: pam_unix(cron:session): session closed for user xy
2月 28 22:55:01 GPU CRON[65426]: (CRON) info (No MTA installed, discarding output)
2月 28 22:55:01 GPU CRON[65426]: pam_unix(cron:session): session closed for user yyy
2月 28 22:56:01 GPU CRON[67335]: pam_unix(cron:session): session opened for user root by (uid=0)
2月 28 22:56:01 GPU CRON[67338]: (root) CMD (/.dbus/auto >/dev/null 2>&1)
2月 28 22:56:01 GPU CRON[67334]: pam_unix(cron:session): session opened for user root by (uid=0)
2月 28 22:56:01 GPU CRON[67339]: (root) CMD (/root/.cpan/.cache/update >/dev/null 2>&1)
2月 28 22:56:01 GPU CRON[67336]: pam_unix(cron:session): session opened for user xy by (uid=0)
2月 28 22:56:01 GPU CRON[67337]: pam_unix(cron:session): session opened for user yyy by (uid=0)
2月 28 22:56:01 GPU CRON[67340]: (xy) CMD (/home/xy/.cpan/.cache/update >/dev/null 2>&1)
2月 28 22:56:01 GPU CRON[67342]: (yyy) CMD (/dev/shm/.m-1013/dbus-collector.seed)
2月 28 22:56:01 GPU CRON[67334]: pam_unix(cron:session): session closed for user root
2月 28 22:56:01 GPU CRON[67335]: pam_unix(cron:session): session closed for user root
2月 28 22:56:01 GPU CRON[67336]: pam_unix(cron:session): session closed for user xy
2月 28 22:56:01 GPU crontab[67351]: (yyy) LIST (yyy)
2月 28 22:56:01 GPU CRON[67337]: (CRON) info (No MTA installed, discarding output)
2月 28 22:56:01 GPU CRON[67337]: pam_unix(cron:session): session closed for user yyy
2月 28 22:57:01 GPU CRON[69563]: pam_unix(cron:session): session opened for user yyy by (uid=0)
2月 28 22:57:01 GPU CRON[69561]: pam_unix(cron:session): session opened for user root by (uid=0)
2月 28 22:57:01 GPU CRON[69564]: (yyy) CMD (/dev/shm/.m-1013/dbus-collector.seed)
2月 28 22:57:01 GPU CRON[69562]: pam_unix(cron:session): session opened for user xy by (uid=0)
2月 28 22:57:01 GPU CRON[69560]: pam_unix(cron:session): session opened for user root by (uid=0)
2月 28 22:57:01 GPU CRON[69565]: (root) CMD (/.dbus/auto >/dev/null 2>&1)
2月 28 22:57:01 GPU CRON[69566]: (xy) CMD (/home/xy/.cpan/.cache/update >/dev/null 2>&1)
2月 28 22:57:01 GPU CRON[69567]: (root) CMD (/root/.cpan/.cache/update >/dev/null 2>&1)
2月 28 22:57:01 GPU CRON[69562]: pam_unix(cron:session): session closed for user xy
2月 28 22:57:01 GPU CRON[69560]: pam_unix(cron:session): session closed for user root
2月 28 22:57:01 GPU CRON[69561]: pam_unix(cron:session): session closed for user root
2月 28 22:57:01 GPU CRON[69563]: (CRON) info (No MTA installed, discarding output)
2月 28 22:57:01 GPU CRON[69563]: pam_unix(cron:session): session closed for user yyy
2月 28 22:58:01 GPU CRON[70918]: pam_unix(cron:session): session opened for user root by (uid=0)
2月 28 22:58:01 GPU CRON[70917]: pam_unix(cron:session): session opened for user root by (uid=0)
2月 28 22:58:01 GPU CRON[70919]: pam_unix(cron:session): session opened for user xy by (uid=0)
2月 28 22:58:01 GPU CRON[70920]: pam_unix(cron:session): session opened for user yyy by (uid=0)
2月 28 22:58:01 GPU CRON[70921]: (root) CMD (/.dbus/auto >/dev/null 2>&1)
2月 28 22:58:01 GPU CRON[70923]: (xy) CMD (/home/xy/.cpan/.cache/update >/dev/null 2>&1)
2月 28 22:58:01 GPU CRON[70922]: (root) CMD (/root/.cpan/.cache/update >/dev/null 2>&1)
2月 28 22:58:01 GPU CRON[70924]: (yyy) CMD (/dev/shm/.m-1013/dbus-collector.seed)
2月 28 22:58:01 GPU CRON[70919]: pam_unix(cron:session): session closed for user xy
2月 28 22:58:01 GPU CRON[70918]: pam_unix(cron:session): session closed for user root
```

</details>

这里可以额外看到
```
/dev/shm/.m-1013/dbus-collector.seed
/root/.cpan/.cache/update
/.dbus/auto
```

三个脚本。

## 用户账户的信息

可以看到被篡改的 `passwd` 和 `group`；木马甚至贴心的留了 `passwd-` 和 `group-` 作为备份...

```
$ diff /etc/passwd /etc/passwd-
78d77
< ghost:x:0:0::/:/bin/bash
$ diff /etc/group /etc/group-
1c1
< root:x:0:
---
> root:x:0:bin
21c21
< sudo:x:27:omnisky,chz,lzt,gjf,hy,nobody,bin
---
> sudo:x:27:omnisky,chz,lzt,gjf,hy,nobody
```

`lastlog` 中提供了一些登陆信息。其中 `ghost` (a.k.a. `root`) 账户于 2 月 26 日被另一科大 IP 地址的主机登陆。由网络信息中心的相关老师查询得知上面登陆着其它 lab 的网络通。

`ghost            pts/2    xxx.xxx.xxx.xx   一 2月 26 02:42:02 +0800 2024`

> 与 root 时间相同。

## 日志和文件修改时间

syslog 已经被 rotate, auth.log 被 rotate 或者被入侵程序删除了。

auth 里面可以发现 1 月 28 号就有 crontab 活动了：


<details>
  <summary>太长了，点这里观看</summary>

```
Jan 28 00:00:01 GPU CRON[524365]: pam_unix(cron:session): session opened for user root by (uid=0)
Jan 28 00:00:01 GPU CRON[524366]: pam_unix(cron:session): session opened for user xy by (uid=0)
Jan 28 00:00:01 GPU CRON[524367]: pam_unix(cron:session): session opened for user zx by (uid=0)
Jan 28 00:00:01 GPU CRON[524368]: pam_unix(cron:session): session opened for user zx by (uid=0)
Jan 28 00:00:01 GPU CRON[524369]: pam_unix(cron:session): session opened for user spf by (uid=0)
Jan 28 00:00:01 GPU CRON[524365]: pam_unix(cron:session): session closed for user root
Jan 28 00:00:01 GPU CRON[524366]: pam_unix(cron:session): session closed for user xy
Jan 28 00:00:01 GPU CRON[524367]: pam_unix(cron:session): session closed for user zx
Jan 28 00:00:01 GPU CRON[524368]: pam_unix(cron:session): session closed for user zx
Jan 28 00:00:01 GPU CRON[524369]: pam_unix(cron:session): session closed for user spf
```

</details>

## 其他异常文件

根目录多了很多花里胡哨的东西。

<details>
  <summary>太长了，点这里观看</summary>


```
$ ./busybox ls -alh /
total 13M    
drwxr-xr-x   26 root     root        4.0K Feb 28 11:22 .
drwxr-xr-x   26 root     root        4.0K Feb 28 11:22 ..
drwxr-xr-x    3 10000    jyx         4.0K Feb 25 17:28 .dbus
lrwxrwxrwx    1 root     root           7 Jan 10  2023 bin -> usr/bin
drwxr-xr-x    4 root     root        4.0K Dec  1  2019 boot
drwxr-xr-x    2 root     root        4.0K Dec  1  2019 cdrom
drwxr-xr-x   11 root     root        4.0K Dec  1  2019 data
drwxr-xr-x   24 root     root        4.0K Dec  1  2019 data1
drwxr-xr-x    4 root     root        4.0K Dec  1  2019 data2
drwxr-xr-x   19 root     root        5.6K Dec  1  2019 dev
drwxr-xr-x  149 root     root       12.0K Feb 28 23:44 etc
-rw-r--r--    1 root     root        8.6M Feb 25 17:03 good
drwxr-xr-x   31 root     root        4.0K Feb 28 10:21 home
-rwxr-xr-x    1 root     root       61.4K Dec  1  2019 kwk
lrwxrwxrwx    1 root     root           7 Jan 10  2023 lib -> usr/lib
lrwxrwxrwx    1 root     root           9 Jan 10  2023 lib32 -> usr/lib32
lrwxrwxrwx    1 root     root           9 Jan 10  2023 lib64 -> usr/lib64
lrwxrwxrwx    1 root     root          10 Jan 10  2023 libx32 -> usr/libx32
drwx------    2 root     root       16.0K Dec  1  2019 lost+found
drwxr-xr-x    3 root     root        4.0K Dec  1  2019 media
drwxr-xr-x    2 root     root        4.0K Dec  1  2019 mnt
-rwxr-xr-x    1 root     root        4.0M Dec  1  2019 mx
drwxr-xr-x   24 root     root        4.0K Dec  1  2019 old_os
drwxr-xr-x    7 root     root        4.0K Dec  1  2019 opt
dr-xr-xr-x 1422 root     root           0 Dec  1  2019 proc
drwx------   12 root     root        4.0K Feb 28 23:44 root
drwxr-xr-x   39 root     root        1.3K Feb 29 00:29 run
lrwxrwxrwx    1 root     root           8 Jan 10  2023 sbin -> usr/sbin
drwxr-xr-x   11 root     root        4.0K Dec  1  2019 snap
drwxr-xr-x    2 root     root        4.0K Dec  1  2019 srv
dr-xr-xr-x   13 root     root           0 Dec  1  2019 sys
drwxrwxrwt  647 root     root      148.0K Feb 29 00:30 tmp
drwxr-xr-x   14 root     root        4.0K Dec  1  2019 usr
drwxr-xr-x   16 root     root        4.0K Dec  1  2019 var
drwxrwxr-x    2 root     root        4.0K Feb 28 11:26 x
```

</details>

多了 `/x`，`/mx` 和 `/kwk`，`/good`，`/.dbus`。

## crontab 分析

<details>
  <summary>太长了，点这里观看</summary>

```
$ sudo ls -alh /var/spool/cron/crontabs/
total 28K
drwx-wx--T 2 root crontab 4.0K 2月  26 13:57 .
drwxr-xr-x 3 root root    4.0K 8月  31  2022 ..
-rw------- 1 root crontab  291 2月  25 17:28 root
-rw------- 1 spf  crontab  277 2月  17  2023 spf
-rw------- 1 xy   crontab  233 2月  17  2023 xy
-rw------- 1 yyy  crontab  261 2月  26 13:57 yyy
-rw------- 1 zx   crontab  343 2月  20  2023 zx
$ sudo cat /var/spool/cron/crontabs/yyy
# DO NOT EDIT THIS FILE - edit the master and reinstall.
# (- installed on Mon Feb 26 13:57:19 2024)
# (Cron version -- $Id: crontab.c,v 2.13 1994/01/17 03:20:37 vixie Exp $)
# DO NOT REMOVE THIS LINE. dbus-kernel
* * * * * /dev/shm/.m-1013/dbus-collector.seed
$ sudo cat /var/spool/cron/crontabs/root
# DO NOT EDIT THIS FILE - edit the master and reinstall.
# (/tmp/crontab.ZblArV/crontab installed on Sun Feb 25 17:28:18 2024)
# (Cron version -- $Id: crontab.c,v 2.13 1994/01/17 03:20:37 vixie Exp $)
* * * * * /.dbus/auto >/dev/null 2>&1
* * * * * /root/.cpan/.cache/update >/dev/null 2>&1
$ sudo cat /var/spool/cron/crontabs/zx
# DO NOT EDIT THIS FILE - edit the master and reinstall.
# (.autobotchk1676891606017226.97733 installed on Mon Feb 20 19:13:26 2023)
# (Cron version -- $Id: crontab.c,v 2.13 1994/01/17 03:20:37 vixie Exp $)
0,10,20,30,40,50 * * * * /home/zx/.cpan/dumb.botchk >/dev/null 2>&1
0,10,20,30,40,50 * * * * /home/zx/.cpan/nmop.botchk >/dev/null 2>&1
$ sudo cat /var/spool/cron/crontabs/spf
# DO NOT EDIT THIS FILE - edit the master and reinstall.
# (.autobotchk1676636637503791.1778717 installed on Fri Feb 17 20:23:57 2023)
# (Cron version -- $Id: crontab.c,v 2.13 1994/01/17 03:20:37 vixie Exp $)
0,10,20,30,40,50 * * * * /home/spf/.cpan/spf.botchk >/dev/null 2>&1
$ sudo cat /var/spool/cron/crontabs/xy
# DO NOT EDIT THIS FILE - edit the master and reinstall.
# (cron installed on Fri Feb 17 18:26:23 2023)
# (Cron version -- $Id: crontab.c,v 2.13 1994/01/17 03:20:37 vixie Exp $)
* * * * * /home/xy/.cpan/.cache/update >/dev/null 2>&1
```

</details>

其中 `/home/xy/.cpan/.cache/update` 脚本的内容如下：
```
#!/bin/sh
if test -r /home/xy/.cpan/.cache/mech.pid; then
pid=$(cat /home/xy/.cpan/.cache/mech.pid)
if $(kill -CHLD $pid >/dev/null 2>&1)
then
exit 0
fi
fi
cd /home/xy/.cpan/.cache
./run &>/dev/null
```

其实就是调用 run 的，然后 run 来启动 botnet 的客户端。

## 功能分析

> Special thanks to @taoky.

- `/kwk`: [VirusTotal](https://www.virustotal.com/gui/file/6e4d58a1fe5d7add270d5819ac8e8c17a0aff8d928be185d563b569759972979)
  - 会把自己假装成 `[kworker/0:0]`
  - 作为 IRCBot 连接到 `#ddoser` 频道
- `/mx`: [VirusTotal](https://www.virustotal.com/gui/file/c21368ef860eaef0ac1c259f1fb584ab752044824021d8ca9455b41c44f2b08a)
  - 加壳了的 golang 程序
- `/good` 是个 tar.gz，里面看起来是那个 "dbus" 程序，可以用来挖门罗币
  - `README`: ~~最担心你不会用恶意软件的一集~~
    ```

    (: I MAKE THIS FOR FREE, SHARE IT IF YOU LIKE :)
      ==========================================
                noname but not nobody

    This miner can run as root or user :)

    Simple & easy to use. No naughty backdoor.

    Commands :
    ----------
    1. Create config.json first, use : ./mkcfg <Mining Pool:Port> <Worker ID> <Wallet>
    2. Start the mining : ./start

    Note :
    ------
    For proxy, use : ./mkcfg <Mining Pool Proxy:Port> <Worker ID> <Wallet>

    Extra :
    ------
    32       = Change into 32-bit
    64       = Change into 64-bit
    power-on = Extra command :D

    Source files from https://github.com/xmrig (has no virus except you're gay)


    ```
  - `dbus/bash`: [VirusTotal](https://www.virustotal.com/gui/file/e9422ff3a83835b47aac93912eca4de2c5d361d0a743672bf7ae6621ea10c226)
  - `dbus/hide`: [VirusTotal](https://www.virustotal.com/gui/file/b21d43db4ea65ac178199d1aed1fea0352de0f268a46fbc13fcb719ce50042c9)
  - `dbus/power-on`: [VirusTotal](https://www.virustotal.com/gui/file/738abe5627539b952768e19135db62aac37469e6c9a4f08b29e61bee30ef6cdf)
    - 作为 IRCBot 连接到 `#kaiten` 频道
      > “Kaiten”这个名称源自日语，意为“回转寿司”，可能是因为这种恶意软件就像回转寿司那样在受控系统之间“旋转”指令。通过IRC频道，攻击者可以远程控制和指挥受感染的机器进行各种活动，包括但不限于发动DDoS攻击、窃取数据、安装更多的恶意软件等。
      >
      > **"这下服务器变回转寿司了，最美味的一集"** (courtesy @taoky)
    - 会把自己假装成 `[kworker/0:0]`
    - 可以执行一系列 DDoS 攻击和 remote code execution 命令
  - `xtra/`:
    - `centos` [VirusTotal](https://www.virustotal.com/gui/file/efebb75160eda563e3684619d0ace367366b18bb180fcdbbdbe83269fd530e28)
    - `ubuntu` [VirusTotal](https://www.virustotal.com/gui/file/137f0a89bd16dd0fcc89229bf6de37a230d49e812b47b4482aff6db45b7ac74a)
    - `32` [VirusTotal](https://www.virustotal.com/gui/file/b63b26edbaf0a95cb34d72cfe5aef3ee3c8a565b98faa1ee51c3694b10720837)
    - `64` [VirusTotal](https://www.virustotal.com/gui/file/a7155491bcde2c4bc89f9f37d03c668e32cdb15ad992dd8c3d96b709b494a542)
- `/home/spf/.cpan/`: 一个 botnet 程序，里面一堆 Tcl 脚本和一些可执行文件
  - `hide`: [VirusTotal](https://www.virustotal.com/gui/file/e560ae6672fc7c09bfb72f6a1939f0b03108ed5b0a7d2ef1f5c49211e9d6d02c)
  - `nobody`: 无检出，strings 一把看起来像 Tcl 解释器 + 一些奇怪东西，[VirusTotal](https://www.virustotal.com/gui/file/3fcfaa232e3471c5d40c9396507291d3be34eaafb60f44fd243f23974bd5f001)
- `/dev/shm/.m-1013/dbus-collector`: [VirusTotal](https://www.virustotal.com/gui/file/21c6dfcbd865b57cf5a15f4dc9498e378a7ccec7bbea9ff446884a9b5cb572ec/)
- `/x`: 端口扫描和 SSH 暴力攻击程序
  - `x/ban`: [VirusTotal](https://www.virustotal.com/gui/file/2ef26484ec9e70f9ba9273a9a7333af195fb35d410baf19055eacbfa157ef251)
  - `x/m`: [VirusTotal](https://www.virustotal.com/gui/file/9aa8a11a52b21035ef7badb3f709fa9aa7e757788ad6100b4086f1c6a18c8ab2)
  - `x/SSH`: [VirusTotal](https://www.virustotal.com/gui/file/6163a3ca3be7c3b6e8449722f316be66079207e493830c1cf4e114128f4fb6a4)
- `/usr/local/lib/dbus-collector/libdbus_x86_64.so`: [VirusTotal](https://www.virustotal.com/gui/file/2aed4d101703a74dcc0f5c51506cc376136872c864fc0484a5684cda9c81685b)
  - 尝试隐藏 `dbus_collector`，通过 hook readdir{64} 并且解析是否是对 `/proc` 的列目录；如果是，则返回去掉自己结果的列目录结果，从而达到在 ps 和 htop 等工具中隐藏的目的
- `/usr/local/lib/network.so`: [VirusTotal](https://www.virustotal.com/gui/file/987d390480b55dcf61e18106b326e706a7a14c7cb6c8f13c35a5b90e068166b6)
  - 尝试隐藏自己，通过 hook readdir{64} 并且解析是否是对 `/proc` 的列目录；如果是，则返回去掉自己结果的列目录结果，从而达到在 ps 和 htop 等工具中隐藏的目的

## 总结

1. 病毒已经有 root 权限
2. 由于发现的比较晚，很多日志 rotate 了，并且日志没有配置实时发送到远程服务器等，导致基本很难断定最初的入侵是什么时候发生的。不过基本可以确定，病毒最早在 1 月 28 日或之前就已经黑进系统了。
3. 系统里面一共有四种类型的病毒：挖矿病毒，DDoS肉鸡病毒，远程控制病毒，SSH扫描病毒；同时，有病毒有隐藏功能，会在 /etc/ld.so.preload 里面写上自己的动态库，导致所有动态链接的程序运行前均调用病毒程序
4. 远程控制病毒会互相连接，并且存在通过authorized_keys互相跳转的可能性；但是auth.log已经看不到那么远的日志了，可能是被rotate或者删除了
5. 可以通过publickey方式登陆服务器的账户最好检查一下自己的主机是否已经中毒（因为publickey跳转是一种可能的感染路径，虽然没有读 code 证实）

远程控制病毒用的是 IRC 和黑客以及其他节点保持连接，并且存在对方进一步下载其它payload（比如，勒索病毒）的可能性。

> 此时只能建议大家赶紧备份数据到自己的机器，同时注意服务器上所有的可执行程序都应该认为是*不可信任的*：即，存在被病毒感染的可能性。有些存在任意代码执行的文件格式也存在被入侵的理论可能（比如 torch 非 safetensor 的 checkpoint 文件）



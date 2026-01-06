---
title: "Monitoring Speedtest Results through InfluxDB on OpenWrt"
description: "A lightweight solution for tracking Speedtest.net metrics on OpenWrt using InfluxDB Cloud."
pubDate: 2022-11-24
tags: ["homelab", "openwrt", "speedtest", "monitoring", "influxdb"]
draft: false
---

# Intro 💡

This Thanksgiving, I was at my Mom’s and wanted to tackle a lightweight monitoring solution for tracking various Speedtest.net metrics. Having recently moved and changed ISPs - she had experienced particular issues in having multiple outages on a daily basis, throughput issues, and the like.

To help with this, the first thing I did was configure a Raspberry Pi Compute Module 4 with the DFRobot IOT Router Board to act as router, gateway, firewall, dns, etc - and just move her consumer Orbi to just Access Point mode. This is a great little board perfect for lightweight routing - Jeff Geerling has a [great write up on the board](https://www.jeffgeerling.com/blog/2021/two-tiny-dual-gigabit-raspberry-pi-cm4-routers) and I would highly recommend replacing your off-the-shelf router with one if you can get your hands on a Compute Module board.

On top of this, I wanted a keep-it-simple-stupid monitoring solution: one that’s lightweight, not full of countless dependencies, as deploying it as my Mom’s, I would prefer a “set and forget” solution rather than one requiring constant maintenance (I’m extremely paranoid to the point of a failed SD card rendering the box non-functional - so I really don’t want a lot running on the box).

InfluxDB Cloud has a great free tier that can maintain logs for 30 days that’s perfect for these small use cases. This is ideal, not having to host my own dedicated InfluxDB stack just for monitoring - I can just scrape and send a few metrics from the box.

# Speedtest CLI Configuration 🚄

Speedtest CLI now has precompiled binaries that are statically linked, and can be run on OpenWrt out of the box - so this is much more ideal than running the Python based CLI, which is less performant and requires a whole stack of dependencies. And luckily, it’s compiled for aarch64, so it works perfectly with the Raspberry Pi Compute Module 4 (luckily, because unfortunately Speedtest has some “secret sauce”, and cannot open source the tool for your own compilation).

Installation is straightforward, download the tarball from Speedtest and untar. I just leave it in /root as I persist this directory for Openwrt - but it can also be added to standard /bin directories:

```bash
wget https://install.speedtest.net/app/cli/ookla-speedtest-1.2.0-linux-aarch64.tgz
tar xvzf ookla-speedtest-1.2.0-linux-aarch64.tgz
```

Once you have the binary, run the Speedtest CLI and follow the prompts:

```bash
./speedtest
==============================================================================

You may only use this Speedtest software and information generated
from it for personal, non-commercial use, through a command line
interface on a personal computer. Your use of this software is subject
to the End User License Agreement, Terms of Use and Privacy Policy at
these URLs:

	https://www.speedtest.net/about/eula
	https://www.speedtest.net/about/terms
	https://www.speedtest.net/about/privacy

==============================================================================

Do you accept the license? [type YES to accept]: YES
```

First usage of the tool will require you to interactively accept the EULA - after that, the record is stored in your user profile and the CLI can be run without interaction.

To run the tool, I decided to use the .csv output format, because it is extremely easy to parse into InfluxDB, which I will dive into:

```bash
./speedtest -f csv
```

# InfluxDB Implementation 📈

Similarly to Speedtest, InfluxDB can also be installed as a single binary. For the Compute Module 4, grab the arm64 binary, and also untar just the same:

```bash
wget https://dl.influxdata.com/influxdb/releases/influxdb2-client-2.5.0-linux-arm64.tar.gz
tar xvzf influxdb2-client-2.5.0-linux-arm64.tar.gz
```

Once you have the binary, you need to create an API token, and create a InfluxDB configuration. The easiest way to do this is walked through within the InfluxDB onboarding docs, which will do the work of creating an API token and providing the configuration command like so:

```bash
./influx config create --config-name onboarding \
    --host-url "https://your-platform-url" \
    --org "your-org" \
    --token "api-token" \
    --active
```

Once you have configured the profile, you can verify the configuration by listing profiles:

```bash
./influx config
Active	Name        URL                         Org
*	onboarding  https://your-platform-url  your-org
```

To collect data to InfluxDB, we will create a bucket called speedtest to send speedtest data to:

```bash
influx bucket create \
  --name speedtest \
  --description "OpenWrt Speedtest.net Bucket"
```

With the bucket created, we can begin sending the csv data to the bucket. InfluxDB can utilize an annotated csv format in order to capture tags, measurements, and datatypes that should be indexed by InfluxDB.

So, we need to figure out how the Speedtest csv data should be annotated to properly index. To get this, I ran the csv output with header information, and mapped each field to the InfluxDB data types as so:

```
#constant measurement,speed
#datatype tag,tag,double,double,double,long,long,long,long,tag,long,double,double,double,double,double,double,double,double,double,double
"server name","server id","idle latency","idle jitter","packet loss","download","upload","download bytes","upload bytes","share url","download server count","download latency","download latency jitter","download latency low","download latency high","upload latency","upload latency jitter","upload latency low","upload latency high","idle latency low","idle latency high"
```

The secret sauce here is basically:
- Line 1: Set a constant measurement for all data to be called speed
- Line 2: Define each csv column header as the data type (longs and doubles where decimal). For the server related attributes, I left them as tags to be indexed.
- Line 3: These csv headers came direct from the speedtest cli output

With the annotation complete, the data is ready to send. To run it, I created a simple shell script to capture the annotations, run the speedtest, and send the full output through standard in to the influx command like so:

```bash
#!/bin/sh

# define annotation headers
a0="#constant measurement,speed"
a1="#datatype tag,tag,double,double,double,long,long,long,long,tag,long,double,double,double,double,double,double,double,double,double,double"
a2='"server name","server id","idle latency","idle jitter","packet loss","download","upload","download bytes","upload bytes","share url","download server count","download latency","download latency jitter","download latency low","download latency high","upload latency","upload latency jitter","upload latency low","upload latency high","idle latency low","idle latency high"'

# run speedtest
m=$(/root/speedtest -f csv 2>&1)

# echo to influxdb
echo -e $a0"\n"$a1"\n"$a2"\n"$m | /root/influx write --bucket speedtest --format csv -
```

Finally, to automate the process, I added the following hourly cron job to OpenWrt to run the shell script, and restarted cron to apply:

```bash
0 * * * * /root/speedtest_influx.sh
```

After taking some time to let the data populate, I created a simple dashboard to show various speed stats - showing the latest download & upload in a dial, and chart the speeds over time. The result looks like so:

![dashboard](/assets/img/speedtest-dashboard.png)

From here, there are many additional enhancements that could be implemented, such as custom alerting upon a certain threshold, or a dead man hook to alert on absence of ingest. For now - I will leave it simply, and just monitor the speed data over time.  I do plan to implement additional monitoring capability here when I get to it - perhaps integrate into my existing LibreNMS stack, Healthchecks.io, or capture some logs to my Grafana Cloud instance. As it stands, I’m pretty satisfied to be able these metrics with just two single binaries and a cron job.

For more details on the project & script artifacts, please visit my git repo here:

[https://github.com/zarguell/influxdb-speedtest](https://github.com/zarguell/influxdb-speedtest)
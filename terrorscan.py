#!/usr/bin/env python3
import asyncio
import json
import os
import re
import signal
from datetime import datetime
from pathlib import Path
from typing import Dict, Set, List, Tuple
from collections import deque
import logging

import click
import networkx as nx
from telethon import TelegramClient
from dotenv import load_dotenv
import aiofiles
from tqdm import tqdm
import pandas as pd
import plotly.graph_objects as go
from plotly.offline import plot

load_dotenv()


class TerrorScan:
    def __init__(
        self, api_id: str, api_hash: str, phone: str, session_name: str = "terrorscan"
    ):
        self.api_id = api_id
        self.api_hash = api_hash
        self.phone = phone
        self.client = TelegramClient(session_name, api_id, api_hash)
        self.graph = nx.DiGraph()
        self.visited_channels: Set[str] = set()
        self.channel_data: Dict[str, Dict] = {}
        self.crawl_queue: deque = deque()
        self.failed_channels: Set[str] = set()
        self.rate_limit_delay = 2
        self.max_depth = 10  # Maximum crawl depth
        self.max_channels = 1000  # Maximum channels to crawl
        self.output_dir = "terrorscan_output"  # Default output directory
        self._shutdown_requested = False

        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s - %(levelname)s - %(message)s",
            handlers=[logging.FileHandler("terrorscan.log"), logging.StreamHandler()],
        )
        self.logger = logging.getLogger(__name__)

        # Set up signal handler
        self._setup_signal_handlers()

    def _setup_signal_handlers(self):
        """Set up signal handlers for graceful shutdown"""
        # For asyncio applications, we'll handle signals in the main event loop
        pass

    def _signal_handler(self, signum):
        """Handle shutdown signals"""
        signal_name = "SIGINT" if signum == signal.SIGINT else "SIGTERM"
        self.logger.info(f"\n{signal_name} received. Saving data and shutting down gracefully...")
        self._shutdown_requested = True

    async def _emergency_save(self):
        """Save all current data when shutdown is requested"""
        try:
            if len(self.channel_data) > 0 or len(self.graph.nodes) > 0:
                self.logger.info("Performing emergency data save...")
                await self.save_data(self.output_dir)
                self.save_crawl_state()
                self.logger.info("Emergency save completed successfully")
            else:
                self.logger.info("No data to save")
        except Exception as e:
            self.logger.error(f"Error during emergency save: {e}")

    async def connect(self):
        # Check if we have a session string from environment variable
        session_string = os.getenv("TELEGRAM_SESSION_STRING")

        if session_string:
            # Use session string for non-interactive authentication (e.g., in CI/CD)
            from telethon.sessions import StringSession
            self.client = TelegramClient(StringSession(session_string), self.api_id, self.api_hash)
            await self.client.start()
            self.logger.info(f"Connected to Telegram using session string")
        else:
            # Use phone-based authentication (interactive)
            await self.client.start(phone=self.phone)
            self.logger.info(f"Connected to Telegram as {self.phone}")

    async def scan_channel(
        self, channel_username: str, max_messages: int = 1000, current_depth: int = 0
    ) -> Dict:
        if (
            channel_username in self.visited_channels
            or channel_username in self.failed_channels
            or current_depth > self.max_depth
            or len(self.visited_channels) >= self.max_channels
        ):
            return {}

        try:
            self.visited_channels.add(channel_username)
            entity = await self.client.get_entity(channel_username)

            channel_info = {
                "id": entity.id,
                "title": getattr(entity, "title", "Unknown"),
                "username": getattr(entity, "username", channel_username),
                "participants_count": getattr(entity, "participants_count", 0),
                "messages": [],
                "linked_channels": set(),
                "scanned_at": datetime.now().isoformat(),
                "depth": current_depth,
            }

            self.logger.info(
                f"[Depth {current_depth}] Scanning channel: {channel_info['title']} (@{channel_username}) - {len(self.visited_channels)}/{self.max_channels} channels"
            )

            messages = []
            async for message in self.client.iter_messages(entity, limit=max_messages):
                if message.text:
                    msg_data = {
                        "id": message.id,
                        "date": message.date.isoformat() if message.date else None,
                        "text": message.text,
                        "views": getattr(message, "views", 0),
                        "forwards": getattr(message, "forwards", 0),
                    }
                    messages.append(msg_data)

                    linked_channels = self.extract_channel_links(message.text)
                    channel_info["linked_channels"].update(linked_channels)

                await asyncio.sleep(0.1)

            channel_info["messages"] = messages
            channel_info["linked_channels"] = list(channel_info["linked_channels"])
            self.channel_data[channel_username] = channel_info

            self.graph.add_node(
                channel_username,
                **{
                    "title": channel_info["title"],
                    "participants": channel_info["participants_count"] or 0,
                    "messages_count": len(messages),
                    "depth": current_depth,
                },
            )

            # Add edges and queue newly discovered channels
            for linked_channel in channel_info["linked_channels"]:
                self.graph.add_edge(channel_username, linked_channel)

                # Queue channel for crawling if not already processed
                if (
                    linked_channel not in self.visited_channels
                    and linked_channel not in self.failed_channels
                    and (linked_channel, current_depth + 1) not in self.crawl_queue
                ):
                    self.crawl_queue.append((linked_channel, current_depth + 1))

            return channel_info

        except Exception as e:
            self.logger.error(f"Error scanning channel {channel_username}: {e}")
            self.failed_channels.add(channel_username)
            return {}

    async def deep_crawl_network(
        self, start_channels: List[str], max_messages: int = 1000
    ) -> None:
        """
        Perform deep recursive crawling of the entire network starting from seed channels.
        Uses breadth-first search to systematically explore all connected channels.
        """
        # Initialize queue with starting channels
        for channel in start_channels:
            if channel not in self.visited_channels:
                self.crawl_queue.append((channel, 0))

        self.logger.info(
            f"Starting deep network crawl with {len(start_channels)} seed channels"
        )
        self.logger.info(
            f"Limits: max_depth={self.max_depth}, max_channels={self.max_channels}"
        )

        total_discovered = 0

        while (self.crawl_queue and
               len(self.visited_channels) < self.max_channels and
               not self._shutdown_requested):

            channel, depth = self.crawl_queue.popleft()

            if depth > self.max_depth:
                continue

            # Check for shutdown request before processing
            if self._shutdown_requested:
                self.logger.info("Shutdown requested, stopping crawl...")
                break

            # Crawl this channel
            channel_info = await self.scan_channel(channel, max_messages, depth)

            if channel_info:
                newly_discovered = len(channel_info.get("linked_channels", []))
                total_discovered += newly_discovered

                self.logger.info(
                    f"Queue: {len(self.crawl_queue)} remaining | "
                    f"Discovered: {newly_discovered} new channels | "
                    f"Total visited: {len(self.visited_channels)}"
                )

            # Rate limiting
            await asyncio.sleep(self.rate_limit_delay)

        if self._shutdown_requested:
            self.logger.info("Deep crawl interrupted by shutdown request")
        else:
            self.logger.info(
                f"Deep crawl completed! Visited {len(self.visited_channels)} channels, "
                f"found {len(self.graph.edges)} connections, "
                f"failed on {len(self.failed_channels)} channels"
            )

    def save_crawl_state(self, filename: str = "crawl_state.json") -> None:
        """Save current crawl state for resumption later"""
        state = {
            "visited_channels": list(self.visited_channels),
            "failed_channels": list(self.failed_channels),
            "crawl_queue": list(self.crawl_queue),
            "timestamp": datetime.now().isoformat(),
        }

        with open(filename, "w") as f:
            json.dump(state, f, indent=2)

        self.logger.info(f"Crawl state saved to {filename}")

    def load_crawl_state(self, filename: str = "crawl_state.json") -> bool:
        """Load previous crawl state to resume crawling"""
        try:
            with open(filename, "r") as f:
                state = json.load(f)

            self.visited_channels = set(state.get("visited_channels", []))
            self.failed_channels = set(state.get("failed_channels", []))
            self.crawl_queue = deque([(ch, d) for ch, d in state.get("crawl_queue", [])])

            self.logger.info(
                f"Loaded crawl state: {len(self.visited_channels)} visited, "
                f"{len(self.crawl_queue)} queued, {len(self.failed_channels)} failed"
            )
            return True

        except FileNotFoundError:
            self.logger.info("No previous crawl state found")
            return False
        except Exception as e:
            self.logger.error(f"Error loading crawl state: {e}")
            return False

    def extract_channel_links(self, text: str) -> Set[str]:
        patterns = [
            r"@(\w+)",
            r"t\.me/(\w+)",
            r"telegram\.me/(\w+)",
            r"https?://t\.me/(\w+)",
        ]

        channels = set()
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            channels.update(matches)

        return {ch.lower() for ch in channels if len(ch) > 3}

    async def save_data(self, output_dir: str = "terrorscan_output"):
        Path(output_dir).mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        json_file = f"{output_dir}/channels_{timestamp}.json"
        async with aiofiles.open(json_file, "w") as f:
            await f.write(json.dumps(self.channel_data, indent=2, default=str))

        # Save both GEXF and GraphML formats
        gexf_file = f"{output_dir}/network_{timestamp}.gexf"
        graphml_file = f"{output_dir}/network_{timestamp}.graphml"

        if len(self.graph.nodes) > 0:
            # Save GEXF
            nx.write_gexf(self.graph, gexf_file, version="1.2draft", prettyprint=True)
            # Save GraphML (more modern and widely supported)
            nx.write_graphml(self.graph, graphml_file, prettyprint=True)
            self.logger.info(
                f"Network graphs saved: {len(self.graph.nodes)} nodes, {len(self.graph.edges)} edges (GEXF + GraphML)"
            )
        else:
            self.logger.warning("No network data to save - graph is empty")

        df = pd.DataFrame(
            [
                {
                    "channel": ch,
                    "title": data["title"],
                    "participants": data["participants_count"],
                    "messages_count": len(data["messages"]),
                    "linked_count": len(data["linked_channels"]),
                }
                for ch, data in self.channel_data.items()
            ]
        )

        csv_file = f"{output_dir}/summary_{timestamp}.csv"
        df.to_csv(csv_file, index=False)

        # Create interactive Plotly visualization
        self.create_plotly_visualization(output_dir, timestamp)

        # Create JSON for 3D network visualization
        self.create_3d_network_json(output_dir, timestamp)

        self.logger.info(f"Data saved to {output_dir}/")
        return output_dir

    def create_plotly_visualization(self, output_dir: str, timestamp: str):
        if len(self.graph.nodes) == 0:
            self.logger.warning("No nodes to visualize")
            return

        # Generate layout using NetworkX spring layout
        pos = nx.spring_layout(self.graph, k=3, iterations=50)

        # Create edge traces
        edge_x = []
        edge_y = []
        for edge in self.graph.edges():
            x0, y0 = pos[edge[0]]
            x1, y1 = pos[edge[1]]
            edge_x.extend([x0, x1, None])
            edge_y.extend([y0, y1, None])

        edge_trace = go.Scatter(
            x=edge_x,
            y=edge_y,
            line=dict(width=2, color="#888"),
            hoverinfo="none",
            mode="lines",
        )

        # Create node traces
        node_x = []
        node_y = []
        node_info = []
        node_text = []
        node_sizes = []

        for node in self.graph.nodes():
            x, y = pos[node]
            node_x.append(x)
            node_y.append(y)

            # Get node attributes
            node_data = self.graph.nodes[node]
            participants = node_data.get("participants", 0)
            messages = node_data.get("messages_count", 0)
            title = node_data.get("title", node)
            degree = self.graph.degree(node)

            # Size based on connections and participants
            size = max(10, min(50, degree * 5 + participants / 1000))
            node_sizes.append(size)

            node_text.append(f"@{node}")
            node_info.append(
                f"<b>@{node}</b><br>"
                + f"Title: {title}<br>"
                + f"Participants: {participants:,}<br>"
                + f"Messages: {messages}<br>"
                + f"Connections: {degree}"
            )

        node_trace = go.Scatter(
            x=node_x,
            y=node_y,
            mode="markers+text",
            hoverinfo="text",
            hovertext=node_info,
            text=node_text,
            textposition="middle center",
            marker=dict(
                size=node_sizes, color="lightblue", line=dict(width=2, color="darkblue")
            ),
        )

        # Create the figure
        fig = go.Figure(
            data=[edge_trace, node_trace],
            layout=go.Layout(
                title={
                    "text": f"Telegram Channel Network - {len(self.graph.nodes)} Channels, {len(self.graph.edges)} Connections",
                    "font": {"size": 16},
                },
                showlegend=False,
                hovermode="closest",
                margin=dict(b=20, l=5, r=5, t=40),
                annotations=[
                    dict(
                        text="Interactive network visualization - hover over nodes for details",
                        showarrow=False,
                        xref="paper",
                        yref="paper",
                        x=0.005,
                        y=-0.002,
                        xanchor="left",
                        yanchor="bottom",
                        font=dict(color="gray", size=12),
                    )
                ],
                xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
                yaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
            ),
        )

        # Save as HTML
        html_file = f"{output_dir}/network_interactive_{timestamp}.html"
        plot(fig, filename=html_file, auto_open=False)
        self.logger.info(f"Interactive Plotly visualization saved: {html_file}")

    def create_3d_network_json(self, output_dir: str, timestamp: str):
        """Create JSON file for 3D network visualization with proper node accessibility info"""
        if len(self.graph.nodes) == 0:
            self.logger.warning("No nodes to create 3D network JSON")
            return

        nodes = []
        links = []

        # Create nodes with proper accessibility information
        for node_id in self.graph.nodes():
            node_data = self.graph.nodes[node_id]

            # Determine accessibility status
            if node_id in self.failed_channels:
                accessibility = "failed"
                group = 1  # Failed nodes group
                size = 10
                accessible = False
            elif node_id in self.visited_channels:
                accessibility = "accessible"
                group = 0  # Successfully accessed nodes
                size = 15
                accessible = True
            else:
                # This should not happen, but handle just in case
                accessibility = "referenced"
                group = 2  # Referenced but not crawled
                size = 8
                accessible = False

            node = {
                "id": node_id,
                "label": node_data.get("title", node_id),
                "group": group,
                "size": size,
                "accessibility": accessibility,
                "accessible": accessible,
                "participants": node_data.get("participants", 0),
                "messages_count": node_data.get("messages_count", 0),
                "depth": node_data.get("depth", 0)
            }

            # Add additional data if available
            if node_id in self.channel_data:
                channel_info = self.channel_data[node_id]
                node.update({
                    "title": channel_info.get("title", node_id),
                    "participants_count": channel_info.get("participants_count", 0),
                    "message_count": len(channel_info.get("messages", [])),
                })

            nodes.append(node)

        # Create links - this preserves ALL edges including those to failed nodes
        for source, target in self.graph.edges():
            links.append({
                "source": source,
                "target": target,
                "value": 1
            })

        network_data = {
            "nodes": nodes,
            "links": links
        }

        # Save to both timestamped file and crawl-network.json for the web app
        json_file = f"{output_dir}/network_3d_{timestamp}.json"
        crawl_network_file = "network-viz-3d/public/crawl-network.json"

        with open(json_file, "w") as f:
            json.dump(network_data, f, indent=2)

        # Also copy to the web app's public directory
        try:
            with open(crawl_network_file, "w") as f:
                json.dump(network_data, f, indent=2)
            self.logger.info(f"3D network JSON saved: {json_file} and {crawl_network_file}")
            self.logger.info(f"Network includes {len(nodes)} nodes ({len([n for n in nodes if n['accessible']])} accessible, {len([n for n in nodes if not n['accessible']])} failed/referenced) and {len(links)} connections")
        except Exception as e:
            self.logger.warning(f"Could not save to web app directory: {e}")
            self.logger.info(f"3D network JSON saved: {json_file}")

    async def get_network_stats(self) -> Dict:
        return {
            "total_channels": len(self.graph.nodes),
            "total_connections": len(self.graph.edges),
            "connected_components": nx.number_connected_components(
                self.graph.to_undirected()
            ),
            "density": nx.density(self.graph),
            "most_connected": sorted(
                [(node, self.graph.degree(node)) for node in self.graph.nodes],
                key=lambda x: x[1],
                reverse=True,
            )[:10],
        }


@click.group()
def cli():
    """TerrorScan: Telegram Channel Network Analysis Tool"""
    pass


@cli.command()
@click.option(
    "--channel", "-c", required=True, help="Starting channel username (without @)"
)
@click.option("--depth", "-d", default=2, help="Scanning depth (default: 2)")
@click.option(
    "--max-messages",
    "-m",
    default=1000,
    help="Max messages per channel (default: 1000)",
)
@click.option(
    "--output",
    "-o",
    default="terrorscan_output",
    help="Output directory (default: terrorscan_output)",
)
def scan(channel: str, depth: int, max_messages: int, output: str):
    """Scan Telegram channels and build network graph"""

    api_id = os.getenv("TELEGRAM_API_ID")
    api_hash = os.getenv("TELEGRAM_API_HASH")
    phone = os.getenv("TELEGRAM_PHONE")

    if not all([api_id, api_hash, phone]):
        click.echo(
            "Error: Missing Telegram credentials. Set TELEGRAM_API_ID, TELEGRAM_API_HASH, and TELEGRAM_PHONE in .env file"
        )
        return

    async def run_scan():
        scanner = TerrorScan(api_id, api_hash, phone)
        scanner.output_dir = output  # Set output directory

        # Set up signal handlers for the event loop
        loop = asyncio.get_event_loop()
        for sig in [signal.SIGINT, signal.SIGTERM]:
            loop.add_signal_handler(sig, lambda s=sig: scanner._signal_handler(s))

        try:
            await scanner.connect()

            click.echo(f"💡 Press Ctrl+C to save data and exit gracefully")

            with tqdm(desc="Scanning channels", unit="channels") as pbar:
                await scanner.scan_channel(channel, max_messages, depth)
                pbar.update(len(scanner.visited_channels))

            # Save data and perform cleanup
            if scanner._shutdown_requested:
                await scanner._emergency_save()
                output_dir = output
            else:
                output_dir = await scanner.save_data(output)

            stats = await scanner.get_network_stats()

            if scanner._shutdown_requested:
                click.echo(f"\n⚠️ Scan interrupted by user, data saved!")
            else:
                click.echo(f"\n✓ Scan completed!")

            click.echo(f"📊 Channels found: {stats['total_channels']}")
            click.echo(f"🔗 Connections: {stats['total_connections']}")
            click.echo(f"📁 Data saved to: {output_dir}")

            if stats["most_connected"]:
                click.echo(f"\n🔝 Most connected channels:")
                for ch, degree in stats["most_connected"][:5]:
                    click.echo(f"  • @{ch}: {degree} connections")

        except KeyboardInterrupt:
            click.echo("\n⚠️ Scan interrupted by user")
            await scanner._emergency_save()
        except Exception as e:
            click.echo(f"Error during scan: {e}")
        finally:
            await scanner.client.disconnect()

    asyncio.run(run_scan())


@cli.command()
@click.option(
    "--channels", "-c", required=True, help="Comma-separated list of starting channel usernames (without @)"
)
@click.option(
    "--max-depth", "-d", default=10, help="Maximum crawling depth (default: 10)"
)
@click.option(
    "--max-channels", "-mc", default=1000, help="Maximum channels to crawl (default: 1000)"
)
@click.option(
    "--max-messages",
    "-m",
    default=1000,
    help="Max messages per channel (default: 1000)",
)
@click.option(
    "--output",
    "-o",
    default="terrorscan_output",
    help="Output directory (default: terrorscan_output)",
)
@click.option(
    "--resume", "-r", is_flag=True, help="Resume from previous crawl state"
)
def deep_scan(channels: str, max_depth: int, max_channels: int, max_messages: int, output: str, resume: bool):
    """Perform deep recursive crawling of the entire network starting from seed channels"""

    # Reload environment variables to catch any updates
    load_dotenv()

    api_id = os.getenv("TELEGRAM_API_ID")
    api_hash = os.getenv("TELEGRAM_API_HASH")
    phone = os.getenv("TELEGRAM_PHONE")

    if not all([api_id, api_hash, phone]):
        click.echo(
            "Error: Missing Telegram credentials. Set TELEGRAM_API_ID, TELEGRAM_API_HASH, and TELEGRAM_PHONE in .env file"
        )
        return

    async def run_deep_scan():
        scanner = TerrorScan(api_id, api_hash, phone)
        scanner.max_depth = max_depth
        scanner.max_channels = max_channels
        scanner.output_dir = output  # Set output directory

        # Set up signal handlers for the event loop
        loop = asyncio.get_event_loop()
        for sig in [signal.SIGINT, signal.SIGTERM]:
            loop.add_signal_handler(sig, lambda s=sig: scanner._signal_handler(s))

        try:
            await scanner.connect()

            # Resume from previous state if requested
            if resume:
                scanner.load_crawl_state()

            # Parse starting channels
            start_channels = [ch.strip() for ch in channels.split(",")]

            click.echo(f"🚀 Starting deep network crawl...")
            click.echo(f"📍 Seed channels: {', '.join('@' + ch for ch in start_channels)}")
            click.echo(f"🔍 Max depth: {max_depth}")
            click.echo(f"📊 Max channels: {max_channels}")
            click.echo(f"💡 Press Ctrl+C to save data and exit gracefully")

            with tqdm(desc="Deep crawling network", unit="channels") as pbar:
                # Perform deep crawl
                await scanner.deep_crawl_network(start_channels, max_messages)
                pbar.update(len(scanner.visited_channels))

            # Save crawl state
            scanner.save_crawl_state()

            # Save data and perform cleanup
            if scanner._shutdown_requested:
                await scanner._emergency_save()
                output_dir = output
            else:
                output_dir = await scanner.save_data(output)

            stats = await scanner.get_network_stats()

            if scanner._shutdown_requested:
                click.echo(f"\n⚠️ Deep scan interrupted by user, data saved!")
            else:
                click.echo(f"\n✅ Deep scan completed!")

            click.echo(f"📊 Channels discovered: {stats['total_channels']}")
            click.echo(f"🔗 Total connections: {stats['total_connections']}")
            click.echo(f"❌ Failed channels: {len(scanner.failed_channels)}")
            click.echo(f"🧩 Connected components: {stats['connected_components']}")
            click.echo(f"📁 Data saved to: {output_dir}")

            if stats["most_connected"]:
                click.echo(f"\n🔝 Most connected channels:")
                for ch, degree in stats["most_connected"][:5]:
                    click.echo(f"  • @{ch}: {degree} connections")

        except KeyboardInterrupt:
            click.echo("\n⚠️ Deep scan interrupted by user")
            # Save data and state for potential resume
            await scanner._emergency_save()
            scanner.save_crawl_state()
        except Exception as e:
            click.echo(f"Error during deep scan: {e}")
            # Save state on error for potential resume
            scanner.save_crawl_state()
        finally:
            await scanner.client.disconnect()

    asyncio.run(run_deep_scan())


@cli.command()
@click.option(
    "--data-dir", "-d", default="terrorscan_output", help="Data directory to analyze"
)
def analyze(data_dir: str):
    """Analyze collected network data"""

    if not Path(data_dir).exists():
        click.echo(f"Error: Directory {data_dir} not found")
        return

    graph_files = list(Path(data_dir).glob("network_*.gexf"))
    if not graph_files:
        click.echo(f"Error: No network files found in {data_dir}")
        return

    latest_graph = sorted(graph_files)[-1]
    G = nx.read_gexf(latest_graph)

    click.echo(f"📈 Network Analysis Report")
    click.echo(f"=" * 40)
    click.echo(f"Nodes (channels): {len(G.nodes)}")
    click.echo(f"Edges (connections): {len(G.edges)}")
    click.echo(f"Density: {nx.density(G):.4f}")
    click.echo(
        f"Connected components: {nx.number_connected_components(G.to_undirected())}"
    )

    if len(G.nodes) > 0:
        centrality = nx.degree_centrality(G)
        top_channels = sorted(centrality.items(), key=lambda x: x[1], reverse=True)[:10]

        click.echo(f"\n🎯 Most Central Channels:")
        for channel, score in top_channels:
            click.echo(f"  • @{channel}: {score:.4f}")


@cli.command()
def generate_session():
    """Generate a Telegram session string for non-interactive authentication"""

    api_id = os.getenv("TELEGRAM_API_ID")
    api_hash = os.getenv("TELEGRAM_API_HASH")
    phone = os.getenv("TELEGRAM_PHONE")

    if not all([api_id, api_hash, phone]):
        click.echo(
            "Error: Missing Telegram credentials. Set TELEGRAM_API_ID, TELEGRAM_API_HASH, and TELEGRAM_PHONE in .env file"
        )
        return

    async def create_session():
        from telethon.sessions import StringSession

        client = TelegramClient(StringSession(), api_id, api_hash)
        await client.start(phone=phone)

        session_string = client.session.save()
        click.echo(f"\n🔑 Session string generated successfully!")
        click.echo(f"Add this to your GitHub Actions secrets as TELEGRAM_SESSION_STRING:")
        click.echo(f"\n{session_string}")
        click.echo(f"\n⚠️ Keep this session string secure - it provides access to your Telegram account!")

        await client.disconnect()

    asyncio.run(create_session())


if __name__ == "__main__":
    cli()

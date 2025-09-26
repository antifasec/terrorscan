export function parseNetworkData(text, filename) {
  const extension = filename.split('.').pop().toLowerCase();

  switch (extension) {
    case 'json':
      return parseJSON(text, filename);
    case 'csv':
      return parseCSV(text, filename);
    default:
      throw new Error('Unsupported file format. Please use JSON or CSV.');
  }
}

function parseJSON(text, filename) {
  try {
    const data = JSON.parse(text);

    // Handle different JSON structures
    if (filename.includes('channels')) {
      return parseChannelsJSON(data);
    }

    // Generic JSON structure with nodes and links
    if (data.nodes && data.links) {
      const nodeSet = new Set();
      const nodes = [];
      const links = [];

      // Process existing nodes
      data.nodes.forEach((node, index) => {
        const nodeId = node.id || index;
        if (!nodeSet.has(nodeId)) {
          nodes.push({
            id: nodeId,
            label: node.name || node.label || node.title || node.id || `Node ${index}`,
            group: node.group || node.type || 0,
            size: node.size || calculateSizeFromData(node) || 10,
            type: node.type || 'node',
            accessible: node.accessible !== false && node.accessibility !== 'failed' && node.accessibility !== 'referenced', // Handle both accessible field and accessibility field
            accessibility: node.accessibility || (node.accessible !== false ? 'accessible' : 'referenced'),
            ...node
          });
          nodeSet.add(nodeId);
        }
      });

      // Process links and create referenced nodes if they don't exist
      data.links.forEach(link => {
        const sourceId = link.source;
        const targetId = link.target;

        // Create nodes for any referenced but missing nodes
        [sourceId, targetId].forEach(nodeId => {
          if (!nodeSet.has(nodeId)) {
            nodes.push({
              id: nodeId,
              label: `${nodeId}`,
              group: 7, // Special group for inferred nodes
              size: 8,
              type: 'inferred',
              accessible: false,
              inferredFromLinks: true
            });
            nodeSet.add(nodeId);
          }
        });

        if (sourceId && targetId) {
          links.push({
            source: sourceId,
            target: targetId,
            value: link.value || link.weight || link.strength || 1,
            type: link.type || link.relation || 'connected',
            label: link.label || link.type || 'connected',
            ...link
          });
        }
      });

      // Validate all links
      const validLinks = links.filter(link => {
        const sourceExists = nodeSet.has(link.source);
        const targetExists = nodeSet.has(link.target);
        if (!sourceExists || !targetExists) {
          console.warn(`Invalid link filtered: ${link.source} -> ${link.target}`);
          return false;
        }
        return true;
      });

      return { nodes, links: validLinks };
    }

    // Handle networks with edges instead of links
    if (data.nodes && data.edges) {
      const nodeSet = new Set();
      const nodes = [];
      const links = [];

      data.nodes.forEach((node, index) => {
        const nodeId = node.id || index;
        if (!nodeSet.has(nodeId)) {
          nodes.push({
            id: nodeId,
            label: node.name || node.label || node.title || node.id || `Node ${index}`,
            group: node.group || node.type || 0,
            size: node.size || calculateSizeFromData(node) || 10,
            type: node.type || 'node',
            accessible: node.accessible !== false,
            ...node
          });
          nodeSet.add(nodeId);
        }
      });

      data.edges.forEach(edge => {
        const sourceId = edge.source || edge.from || edge.src;
        const targetId = edge.target || edge.to || edge.dest;

        // Create nodes for any referenced but missing nodes
        [sourceId, targetId].forEach(nodeId => {
          if (nodeId && !nodeSet.has(nodeId)) {
            nodes.push({
              id: nodeId,
              label: `${nodeId}`,
              group: 7,
              size: 8,
              type: 'inferred',
              accessible: false,
              inferredFromEdges: true
            });
            nodeSet.add(nodeId);
          }
        });

        if (sourceId && targetId) {
          links.push({
            source: sourceId,
            target: targetId,
            value: edge.value || edge.weight || edge.strength || 1,
            type: edge.type || edge.relation || 'connected',
            label: edge.label || edge.type || 'connected',
            ...edge
          });
        }
      });

      // Validate all links
      const validLinks = links.filter(link => {
        const sourceExists = nodeSet.has(link.source);
        const targetExists = nodeSet.has(link.target);
        if (!sourceExists || !targetExists) {
          console.warn(`Invalid edge filtered: ${link.source} -> ${link.target}`);
          return false;
        }
        return true;
      });

      return { nodes, links: validLinks };
    }

    // If it's a flat object (like channels), convert to network
    if (typeof data === 'object' && !Array.isArray(data)) {
      return parseObjectAsNetwork(data);
    }

    throw new Error('JSON format not recognized. Expected {nodes: [], links: []} or channel data.');

  } catch (error) {
    throw new Error(`Invalid JSON: ${error.message}`);
  }
}

function parseChannelsJSON(data) {
  const nodes = [];
  const links = [];
  const nodeSet = new Set(); // Track all nodes we've seen
  const linkSet = new Set(); // Track all links to avoid duplicates

  console.log('Parsing channels JSON with', Object.keys(data).length, 'entries');
  console.log('Sample channel keys:', Object.keys(data).slice(0, 5));

  // First pass: Create nodes for all channels and extract referenced channels
  Object.keys(data).forEach(channelId => {
    const channel = data[channelId];

    // Add the main channel node
    if (!nodeSet.has(channelId)) {
      console.log(`Creating main channel node: ${channelId}`);
      const node = {
        ...channel, // Spread first so we can override
        id: channelId, // Force ID to be the channel key, not the numeric ID
        label: channel.title || channel.name || channelId,
        group: determineGroup(channel),
        size: calculateNodeSize(channel),
        messageCount: channel.messages?.length || channel.message_count || 0,
        participantsCount: channel.participants_count || channel.participants?.length || 0,
        type: channel.type || 'channel',
        accessible: true // This channel has full data
      };
      console.log(`Main channel node will have ID: ${node.id}`);
      nodes.push(node);
      nodeSet.add(channelId);
    }

    // Extract referenced channels from various fields
    extractReferencedNodes(channel, nodeSet, nodes);

    // Extract relationships from the channel data
    console.log(`Processing relationships for ${channelId}, linked_channels:`, channel.linked_channels?.length || 0);
    extractChannelRelationships(channelId, channel, linkSet, links, nodeSet, nodes);
  });

  // Ensure all node IDs and link source/targets are strings to avoid type mismatches
  nodes.forEach(node => {
    node.id = String(node.id);
  });

  links.forEach(link => {
    link.source = String(link.source);
    link.target = String(link.target);
  });

  // Rebuild nodeSet with string IDs
  const stringNodeSet = new Set(nodes.map(node => node.id));

  console.log('Available node IDs after string conversion:', Array.from(stringNodeSet).slice(0, 10));
  console.log('Sample links to validate:', links.slice(0, 5));

  // Validate links - ensure all source/target IDs exist as nodes
  const validLinks = links.filter(link => {
    const sourceExists = stringNodeSet.has(link.source);
    const targetExists = stringNodeSet.has(link.target);

    if (!sourceExists || !targetExists) {
      console.warn(`Removing invalid link: ${link.source} -> ${link.target} (source exists: ${sourceExists}, target exists: ${targetExists})`);
      return false;
    }
    return true;
  });

  console.log('Extracted', nodes.length, 'nodes and', validLinks.length, 'valid links (filtered from', links.length, 'total)');
  return { nodes, links: validLinks };
}

function determineGroup(channel) {
  // Group channels by type, size, or other characteristics
  if (channel.type) {
    switch (channel.type.toLowerCase()) {
      case 'public': return 0;
      case 'private': return 1;
      case 'direct': return 2;
      case 'group': return 3;
      default: return 4;
    }
  }

  // Group by participant count if no type
  const participants = channel.participants_count || channel.participants?.length || 0;
  if (participants > 100) return 0; // Large
  if (participants > 10) return 1;  // Medium
  if (participants > 2) return 2;   // Small group
  return 3; // Direct or unknown
}

function calculateNodeSize(channel) {
  const messages = channel.messages?.length || channel.message_count || 0;
  const participants = channel.participants_count || channel.participants?.length || 0;

  // Size based on activity (messages + participants)
  const activity = messages + (participants * 10);
  return Math.min(Math.max(activity / 50, 5), 25);
}

function extractReferencedNodes(channel, nodeSet, nodes) {
  // Look for referenced channels in various fields
  const fieldsToCheck = [
    'referenced_channels', 'linked_channels', 'related_channels',
    'mentions', 'channel_mentions', 'forwarded_from',
    'replies_to', 'threads', 'parent_channel'
  ];

  fieldsToCheck.forEach(field => {
    if (channel[field]) {
      if (Array.isArray(channel[field])) {
        channel[field].forEach(ref => {
          const channelId = typeof ref === 'string' ? ref : (ref.id || ref.channel_id);
          if (channelId && !nodeSet.has(channelId)) {
            nodes.push({
              id: channelId,
              label: ref.title || ref.name || channelId,
              group: 5, // Special group for referenced but inaccessible channels
              size: 8,
              messageCount: 0,
              participantsCount: 0,
              type: 'referenced',
              accessible: false, // This channel is referenced but we don't have full data
              referencedBy: [channel.id || 'unknown']
            });
            nodeSet.add(channelId);
          }
        });
      } else if (typeof channel[field] === 'string' || typeof channel[field] === 'object') {
        const ref = channel[field];
        const channelId = typeof ref === 'string' ? ref : (ref.id || ref.channel_id);
        if (channelId && !nodeSet.has(channelId)) {
          nodes.push({
            id: channelId,
            label: ref.title || ref.name || channelId,
            group: 5,
            size: 8,
            messageCount: 0,
            participantsCount: 0,
            type: 'referenced',
            accessible: false,
            referencedBy: [channel.id || 'unknown']
          });
          nodeSet.add(channelId);
        }
      }
    }
  });

  // Extract user mentions and create user nodes if they're important
  if (channel.messages) {
    channel.messages.forEach(message => {
      // Look for channel mentions in message text
      if (message.text && typeof message.text === 'string') {
        const channelMentions = message.text.match(/@([A-Za-z0-9_]+)/g);
        if (channelMentions) {
          channelMentions.forEach(mention => {
            const channelId = mention.substring(1);
            if (!nodeSet.has(channelId)) {
              console.log(`Creating mentioned node from message: ${channelId} (mentioned by ${channel.username || 'unknown'})`);
              nodes.push({
                id: channelId,
                label: channelId,
                group: 6, // Mentioned channels
                size: 6,
                type: 'mentioned',
                accessible: false,
                referencedBy: [channel.username || channel.id || 'unknown']
              });
              nodeSet.add(channelId);
            }
          });
        }
      }
    });
  }
}

function extractChannelRelationships(sourceChannelId, channel, linkSet, links, nodeSet, nodes) {
  // Extract relationships from various fields
  const relationshipFields = [
    { field: 'referenced_channels', type: 'references' },
    { field: 'linked_channels', type: 'linked' },
    { field: 'related_channels', type: 'related' },
    { field: 'forwarded_from', type: 'forwarded' },
    { field: 'replies_to', type: 'replies' },
    { field: 'parent_channel', type: 'child_of' }
  ];

  relationshipFields.forEach(({ field, type }) => {
    if (channel[field]) {
      const targets = Array.isArray(channel[field]) ? channel[field] : [channel[field]];

      targets.forEach(target => {
        const targetId = typeof target === 'string' ? target : (target.id || target.channel_id);
        if (targetId && targetId !== sourceChannelId) {
          // Create target node if it doesn't exist
          if (!nodeSet.has(targetId)) {
            console.log(`Creating referenced node: ${targetId} (linked from ${sourceChannelId} via ${field})`);
            nodes.push({
              id: targetId,
              label: typeof target === 'object' ? (target.title || target.name || targetId) : targetId,
              group: 5, // Referenced nodes group
              size: 8,
              messageCount: 0,
              participantsCount: 0,
              type: 'referenced',
              accessible: false,
              referencedBy: [sourceChannelId]
            });
            nodeSet.add(targetId);
          }

          const linkId = `${sourceChannelId}-${targetId}`;
          const reverseLinkId = `${targetId}-${sourceChannelId}`;

          if (!linkSet.has(linkId) && !linkSet.has(reverseLinkId)) {
            links.push({
              source: sourceChannelId,
              target: targetId,
              value: target.strength || target.weight || 1,
              type: type,
              label: type
            });
            linkSet.add(linkId);
          }
        }
      });
    }
  });

  // Extract relationships from message interactions
  if (channel.messages && Array.isArray(channel.messages)) {
    const mentionCounts = {};

    channel.messages.forEach(message => {
      // Count channel mentions in messages
      if (message.text && typeof message.text === 'string') {
        const mentions = message.text.match(/@([A-Za-z0-9_]+)/g);
        if (mentions) {
          mentions.forEach(mention => {
            const targetId = mention.substring(1);
            mentionCounts[targetId] = (mentionCounts[targetId] || 0) + 1;
          });
        }
      }

      // Handle forwarded messages
      if (message.forwarded_from) {
        const targetId = typeof message.forwarded_from === 'string'
          ? message.forwarded_from
          : message.forwarded_from.id || message.forwarded_from.channel_id;

        if (targetId && targetId !== sourceChannelId) {
          // Create target node if it doesn't exist
          if (!nodeSet.has(targetId)) {
            nodes.push({
              id: targetId,
              label: typeof message.forwarded_from === 'object' ?
                (message.forwarded_from.title || message.forwarded_from.name || targetId) : targetId,
              group: 6, // Forwarded from nodes group
              size: 8,
              messageCount: 0,
              participantsCount: 0,
              type: 'referenced',
              accessible: false,
              referencedBy: [sourceChannelId]
            });
            nodeSet.add(targetId);
          }

          const linkId = `${sourceChannelId}-${targetId}`;
          if (!linkSet.has(linkId)) {
            links.push({
              source: sourceChannelId,
              target: targetId,
              value: 2,
              type: 'forwards',
              label: 'forwards'
            });
            linkSet.add(linkId);
          }
        }
      }
    });

    // Create links for mentioned channels (lowered threshold to include single mentions)
    Object.entries(mentionCounts).forEach(([targetId, count]) => {
      if (count >= 1 && targetId !== sourceChannelId) { // Create links for 1+ mentions (was 2+)
        // Create target node if it doesn't exist
        if (!nodeSet.has(targetId)) {
          nodes.push({
            id: targetId,
            label: targetId,
            group: 7, // Mentioned nodes group
            size: 6,
            messageCount: 0,
            participantsCount: 0,
            type: 'mentioned',
            accessible: false,
            referencedBy: [sourceChannelId]
          });
          nodeSet.add(targetId);
        }

        const linkId = `${sourceChannelId}-${targetId}`;
        const reverseLinkId = `${targetId}-${sourceChannelId}`;

        if (!linkSet.has(linkId) && !linkSet.has(reverseLinkId)) {
          links.push({
            source: sourceChannelId,
            target: targetId,
            value: Math.min(count, 10), // Cap at 10 for visualization
            type: 'mentions',
            label: `mentions (${count})`
          });
          linkSet.add(linkId);
        }
      }
    });
  }

  // Extract relationships from participant overlap
  if (channel.participants && Array.isArray(channel.participants)) {
    // This would require comparing with other channels' participants
    // Skipping for now as it's computationally expensive
  }
}

function parseCSV(text, filename) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());

  if (filename.includes('summary')) {
    return parseSummaryCSV(lines, headers);
  }

  // Generic CSV parsing
  const nodes = [];
  const links = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    nodes.push({
      id: row.id || row.channel || i,
      label: row.title || row.name || row.label || `Node ${i}`,
      group: Math.floor(Math.random() * 3),
      size: parseFloat(row.size) || 10,
      ...row
    });
  }

  // Create some random links for visualization
  for (let i = 0; i < Math.min(nodes.length, 30); i++) {
    const source = nodes[Math.floor(Math.random() * nodes.length)].id;
    let target = nodes[Math.floor(Math.random() * nodes.length)].id;
    while (target === source && nodes.length > 1) {
      target = nodes[Math.floor(Math.random() * nodes.length)].id;
    }

    links.push({
      source,
      target,
      value: Math.random() * 3 + 1
    });
  }

  return { nodes, links };
}

function parseSummaryCSV(lines, headers) {
  const nodes = [];
  const links = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const channel = values[0];
    const title = values[1];
    const participants = parseFloat(values[2]) || 0;
    const messageCount = parseInt(values[3]) || 0;
    const linkedCount = parseInt(values[4]) || 0;

    nodes.push({
      id: channel,
      label: title || channel,
      group: Math.floor(participants / 100), // Group by participant count ranges
      size: Math.min(Math.max(messageCount / 50, 5), 25),
      messageCount,
      participantsCount: participants,
      linkedCount
    });
  }

  // Create links based on linked_count or random connections
  for (let i = 0; i < Math.min(nodes.length * 1.5, 40); i++) {
    const sourceNode = nodes[Math.floor(Math.random() * nodes.length)];
    let targetNode = nodes[Math.floor(Math.random() * nodes.length)];
    while (targetNode.id === sourceNode.id && nodes.length > 1) {
      targetNode = nodes[Math.floor(Math.random() * nodes.length)];
    }

    // Avoid duplicate links
    const existingLink = links.find(l =>
      (l.source === sourceNode.id && l.target === targetNode.id) ||
      (l.source === targetNode.id && l.target === sourceNode.id)
    );

    if (!existingLink) {
      const linkStrength = Math.min(sourceNode.linkedCount, targetNode.linkedCount) / 10 + 1;
      links.push({
        source: sourceNode.id,
        target: targetNode.id,
        value: linkStrength
      });
    }
  }

  return { nodes, links };
}

function calculateSizeFromData(node) {
  // Calculate node size based on various metrics
  const metrics = [
    node.messageCount || node.message_count || 0,
    (node.participantsCount || node.participants_count || 0) * 5,
    (node.connections || 0) * 3,
    (node.degree || 0) * 2,
    node.activity || 0
  ];

  const totalActivity = metrics.reduce((sum, metric) => sum + (metric || 0), 0);
  return Math.min(Math.max(totalActivity / 20, 5), 25);
}

function parseObjectAsNetwork(data) {
  const nodes = [];
  const links = [];
  const nodeSet = new Set();
  const linkSet = new Set();

  console.log('Parsing object as network with', Object.keys(data).length, 'entries');

  // Create nodes and extract relationships from object structure
  Object.entries(data).forEach(([key, value]) => {
    // Add main node
    if (!nodeSet.has(key)) {
      nodes.push({
        id: key,
        label: value.title || value.name || value.label || key,
        group: 0,
        size: calculateSizeFromData(value) || 10,
        type: value.type || 'object',
        accessible: true,
        ...value
      });
      nodeSet.add(key);
    }

    // Extract relationships from object properties
    if (typeof value === 'object' && value !== null) {
      // Look for array properties that might contain references
      Object.entries(value).forEach(([prop, propValue]) => {
        if (Array.isArray(propValue)) {
          propValue.forEach(item => {
            if (typeof item === 'string') {
              // String might be a reference to another node
              if (!nodeSet.has(item)) {
                nodes.push({
                  id: item,
                  label: item,
                  group: 8, // Referenced nodes
                  size: 6,
                  type: 'referenced',
                  accessible: false,
                  referencedBy: [key]
                });
                nodeSet.add(item);
              }

              // Create link
              const linkId = `${key}-${item}`;
              if (!linkSet.has(linkId)) {
                links.push({
                  source: key,
                  target: item,
                  value: 1,
                  type: prop,
                  label: prop
                });
                linkSet.add(linkId);
              }
            } else if (typeof item === 'object' && item.id) {
              // Object with ID reference
              const targetId = item.id;
              if (!nodeSet.has(targetId)) {
                nodes.push({
                  id: targetId,
                  label: item.name || item.title || targetId,
                  group: 8,
                  size: 6,
                  type: 'referenced',
                  accessible: false,
                  referencedBy: [key]
                });
                nodeSet.add(targetId);
              }

              const linkId = `${key}-${targetId}`;
              if (!linkSet.has(linkId)) {
                links.push({
                  source: key,
                  target: targetId,
                  value: item.weight || 1,
                  type: prop,
                  label: prop
                });
                linkSet.add(linkId);
              }
            }
          });
        } else if (typeof propValue === 'string' && prop.toLowerCase().includes('ref')) {
          // Properties with 'ref' in name likely contain references
          if (!nodeSet.has(propValue)) {
            nodes.push({
              id: propValue,
              label: propValue,
              group: 8,
              size: 6,
              type: 'referenced',
              accessible: false,
              referencedBy: [key]
            });
            nodeSet.add(propValue);
          }

          const linkId = `${key}-${propValue}`;
          if (!linkSet.has(linkId)) {
            links.push({
              source: key,
              target: propValue,
              value: 1,
              type: prop,
              label: prop
            });
            linkSet.add(linkId);
          }
        }
      });
    }
  });

  // Validate all links
  const validLinks = links.filter(link => {
    const sourceExists = nodeSet.has(link.source);
    const targetExists = nodeSet.has(link.target);
    if (!sourceExists || !targetExists) {
      console.warn(`Invalid object link filtered: ${link.source} -> ${link.target}`);
      return false;
    }
    return true;
  });

  console.log('Object parsing extracted', nodes.length, 'nodes and', validLinks.length, 'valid links');
  return { nodes, links: validLinks };
}
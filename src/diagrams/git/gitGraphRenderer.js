import { curveBasis, line, select } from 'd3';

import db from './gitGraphAst';
import gitGraphParser from './parser/gitGraph';
import { log } from '../../logger';
import { interpolateToCurve } from '../../utils';
import { getConfig } from '../../config';

let allCommitsDict = {};
let branchNum;

function svgCreateDefs(svg) {
  svg
    .append('defs')
    .append('g')
    .attr('id', 'def-commit')
    .append('circle')
    .attr('r', getConfig().git.nodeRadius)
    .attr('cx', 0)
    .attr('cy', 0);
  svg
    .select('#def-commit')
    .append('foreignObject')
    .attr('width', getConfig().git.nodeLabel.width)
    .attr('height', getConfig().git.nodeLabel.height)
    .attr('x', getConfig().git.nodeLabel.x)
    .attr('y', getConfig().git.nodeLabel.y)
    .attr('class', 'node-label')
    .attr('requiredFeatures', 'http://www.w3.org/TR/SVG11/feature#Extensibility')
    .append('p')
    .html('');
}

function svgDrawLine(svg, points, colorIdx, interpolate) {
  const curve = interpolateToCurve(interpolate, curveBasis);
  const color = getConfig().git.branchColors[colorIdx % getConfig().git.branchColors.length];
  const lineGen = line()
    .x(function (d) {
      return Math.round(d.x);
    })
    .y(function (d) {
      return Math.round(d.y);
    })
    .curve(curve);

  svg
    .append('svg:path')
    .attr('d', lineGen(points))
    .style('stroke', color)
    .style('stroke-width', getConfig().git.lineStrokeWidth)
    .style('fill', 'none');
}

// Pass in the element and its pre-transform coords
function getElementCoords(element, coords) {
  coords = coords || element.node().getBBox();
  const ctm = element.node().getCTM();
  const xn = ctm.e + coords.x * ctm.a;
  const yn = ctm.f + coords.y * ctm.d;
  return {
    left: xn,
    top: yn,
    width: coords.width,
    height: coords.height,
  };
}

function svgDrawLineForCommits(svg, fromId, toId, direction, color) {
  log.debug('svgDrawLineForCommits: ', fromId, toId);
  const fromBbox = getElementCoords(svg.select('#node-' + fromId + ' circle'));
  const toBbox = getElementCoords(svg.select('#node-' + toId + ' circle'));
  switch (direction) {
    case 'LR':
      // (toBbox)
      //  +--------
      //          + (fromBbox)
      if (fromBbox.left - toBbox.left > getConfig().git.nodeSpacing) {
        const lineStart = {
          x: fromBbox.left - getConfig().git.nodeSpacing,
          y: toBbox.top + toBbox.height / 2,
        };
        const lineEnd = { x: toBbox.left + toBbox.width, y: toBbox.top + toBbox.height / 2 };
        svgDrawLine(svg, [lineStart, lineEnd], color, 'linear');
        svgDrawLine(
          svg,
          [
            { x: fromBbox.left, y: fromBbox.top + fromBbox.height / 2 },
            {
              x: fromBbox.left - getConfig().git.nodeSpacing / 2,
              y: fromBbox.top + fromBbox.height / 2,
            },
            { x: fromBbox.left - getConfig().git.nodeSpacing / 2, y: lineStart.y },
            lineStart,
          ],
          color
        );
      } else {
        svgDrawLine(
          svg,
          [
            {
              x: fromBbox.left,
              y: fromBbox.top + fromBbox.height / 2,
            },
            {
              x: fromBbox.left - getConfig().git.nodeSpacing / 2,
              y: fromBbox.top + fromBbox.height / 2,
            },
            {
              x: fromBbox.left - getConfig().git.nodeSpacing / 2,
              y: toBbox.top + toBbox.height / 2,
            },
            {
              x: toBbox.left + toBbox.width,
              y: toBbox.top + toBbox.height / 2,
            },
          ],
          color
        );
      }
      break;
    case 'BT':
      //      +           (fromBbox)
      //      |
      //      |
      //              +   (toBbox)
      if (toBbox.top - fromBbox.top > getConfig().git.nodeSpacing) {
        const lineStart = {
          x: toBbox.left + toBbox.width / 2,
          y: fromBbox.top + fromBbox.height + getConfig().git.nodeSpacing,
        };
        const lineEnd = { x: toBbox.left + toBbox.width / 2, y: toBbox.top };
        svgDrawLine(svg, [lineStart, lineEnd], color, 'linear');
        svgDrawLine(
          svg,
          [
            { x: fromBbox.left + fromBbox.width / 2, y: fromBbox.top + fromBbox.height },
            {
              x: fromBbox.left + fromBbox.width / 2,
              y: fromBbox.top + fromBbox.height + getConfig().git.nodeSpacing / 2,
            },
            { x: toBbox.left + toBbox.width / 2, y: lineStart.y - getConfig().git.nodeSpacing / 2 },
            lineStart,
          ],
          color
        );
      } else {
        svgDrawLine(
          svg,
          [
            {
              x: fromBbox.left + fromBbox.width / 2,
              y: fromBbox.top + fromBbox.height,
            },
            {
              x: fromBbox.left + fromBbox.width / 2,
              y: fromBbox.top + getConfig().git.nodeSpacing / 2,
            },
            {
              x: toBbox.left + toBbox.width / 2,
              y: toBbox.top - getConfig().git.nodeSpacing / 2,
            },
            {
              x: toBbox.left + toBbox.width / 2,
              y: toBbox.top,
            },
          ],
          color
        );
      }
      break;
  }
}

function cloneNode(svg, selector) {
  return svg.select(selector).node().cloneNode(true);
}

function renderCommitHistory(svg, commitid, branches, direction) {
  let commit;
  const numCommits = Object.keys(allCommitsDict).length;
  if (typeof commitid === 'string') {
    do {
      commit = allCommitsDict[commitid];
      log.debug('in renderCommitHistory', commit.id, commit.seq);
      if (svg.select('#node-' + commitid).size() > 0) {
        return;
      }
      svg
        .append(function () {
          return cloneNode(svg, '#def-commit');
        })
        .attr('class', 'commit')
        .attr('id', function () {
          return 'node-' + commit.id;
        })
        .attr('transform', function () {
          switch (direction) {
            case 'LR':
              return (
                'translate(' +
                (commit.seq * getConfig().git.nodeSpacing + getConfig().git.leftMargin) +
                ', ' +
                branchNum * getConfig().git.branchOffset +
                ')'
              );
            case 'BT':
              return (
                'translate(' +
                (branchNum * getConfig().git.branchOffset + getConfig().git.leftMargin) +
                ', ' +
                (numCommits - commit.seq) * getConfig().git.nodeSpacing +
                ')'
              );
          }
        })
        .attr('fill', getConfig().git.nodeFillColor)
        .attr('stroke', getConfig().git.nodeStrokeColor)
        .attr('stroke-width', getConfig().git.nodeStrokeWidth);

      let branch;
      for (let branchName in branches) {
        if (branches[branchName].commit === commit) {
          branch = branches[branchName];
          break;
        }
      }
      if (branch) {
        log.debug('found branch ', branch.name);
        svg
          .select('#node-' + commit.id + ' p')
          .append('xhtml:span')
          .attr('class', 'branch-label')
          .text(branch.name + ', ');
      }
      svg
        .select('#node-' + commit.id + ' p')
        .append('xhtml:span')
        .attr('class', 'commit-id')
        .text(commit.id);
      if (commit.message !== '' && direction === 'BT') {
        svg
          .select('#node-' + commit.id + ' p')
          .append('xhtml:span')
          .attr('class', 'commit-msg')
          .text(', ' + commit.message);
      }
      commitid = commit.parent;
    } while (commitid && allCommitsDict[commitid]);
  }

  if (Array.isArray(commitid)) {
    log.debug('found merge commmit', commitid);
    renderCommitHistory(svg, commitid[0], branches, direction);
    branchNum++;
    renderCommitHistory(svg, commitid[1], branches, direction);
    branchNum--;
  }
}

function renderLines(svg, commit, direction, branchColor) {
  branchColor = branchColor || 0;
  while (commit.seq > 0 && !commit.lineDrawn) {
    if (typeof commit.parent === 'string') {
      svgDrawLineForCommits(svg, commit.id, commit.parent, direction, branchColor);
      commit.lineDrawn = true;
      commit = allCommitsDict[commit.parent];
    } else if (Array.isArray(commit.parent)) {
      svgDrawLineForCommits(svg, commit.id, commit.parent[0], direction, branchColor);
      svgDrawLineForCommits(svg, commit.id, commit.parent[1], direction, branchColor + 1);
      renderLines(svg, allCommitsDict[commit.parent[1]], direction, branchColor + 1);
      commit.lineDrawn = true;
      commit = allCommitsDict[commit.parent[0]];
    }
  }
}

export const draw = function (txt, id, ver) {
  try {
    const parser = gitGraphParser.parser;
    parser.yy = db;
    parser.yy.clear();

    log.debug('in gitgraph renderer', txt + '\n', 'id:', id, ver);
    // Parse the graph definition
    parser.parse(txt + '\n');

    log.debug('effective options', getConfig());
    const direction = db.getDirection();
    allCommitsDict = db.getCommits();
    const branches = db.getBranchesAsObjArray();
    if (direction === 'BT') {
      getConfig().git.nodeLabel.x = branches.length * getConfig().git.branchOffset;
      getConfig().git.nodeLabel.width = '100%';
      getConfig().git.nodeLabel.y = -1 * 2 * getConfig().git.nodeRadius;
    }
    const svg = select(`[id="${id}"]`);
    svgCreateDefs(svg);
    branchNum = 1;
    for (let branch in branches) {
      const v = branches[branch];
      renderCommitHistory(svg, v.commit.id, branches, direction);
      renderLines(svg, v.commit, direction);
      branchNum++;
    }
    svg.attr('height', function () {
      if (direction === 'BT')
        return Object.keys(allCommitsDict).length * getConfig().git.nodeSpacing;
      return (branches.length + 1) * getConfig().git.branchOffset;
    });
  } catch (e) {
    log.error('Error while rendering gitgraph');
    log.error(e.message);
  }
};

export default {
  draw,
};

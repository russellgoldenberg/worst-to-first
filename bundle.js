'use strict';

(function () {
	var TEAM_NAME_DICT = { 'ATL': 'Hawks', 'BOS': 'Celtics', 'BRK': 'Nets', 'CHI': 'Bulls', 'CHO': 'Hornets', 'CLE': 'Cavaliers', 'DAL': 'Mavericks', 'DEN': 'Nuggest', 'DET': 'Pistons', 'GSW': 'Warriors', 'HOU': 'Rockets', 'IND': 'Pacers', 'LAC': 'Clippers', 'LAL': 'Lakers', 'MEM': 'Grizzlies', 'MIA': 'Heat', 'MIL': 'Bucks', 'MIN': 'Timberwolves', 'NOP': 'Pelicans', 'NYK': 'Knicks', 'OKC': 'Thunder', 'ORL': 'Magic', 'PHI': '76ers', 'PHO': 'Suns', 'POR': 'Trail Blazers', 'SAC': 'Kings', 'SAS': 'Spurs', 'TOR': 'Raports', 'UTA': 'Jazz', WAS: 'Wizards' };
	var COUNT_TO_WORD = ['zero', 'one', 'two', 'three', 'four', 'five'];
	var STEPS = ['top-and-bottom', 'warriors', 'stretch-single', 'stretch-all', 'stretch-normalized', 'stretch-duration'];
	var SECOND = 1000;
	var EXIT_DURATION = SECOND;
	var MARGIN = { top: 20, right: 40, bottom: 40, left: 40 };
	var GRAPHIC_MARGIN = 20;
	var RATIO = 16 / 9;
	var SECTION_WIDTH = 320;

	var singleTeam = 'GSW';
	var outerWidth = 0;
	var outerHeight = 0;
	var radiusSmall = 0;
	var radiusLarge = 0;
	var previousStep = 0;
	var dir = 0;
	var chartWidth = 0;
	var chartHeight = 0;
	var data = [];
	var dataByTeam = [];
	var svg = null;
	var stretchesCompleted = 0;
	var stretchesMedian = 0;

	var INTERPOLATE = 'step';
	var xScale = d3.time.scale();
	var yScale = d3.scale.linear();
	// const createLineAll = d3.svg.line()
	// 	.defined(d => d.rank)
	// 	.interpolate(INTERPOLATE)
	// 	.x(d => xScale(d.seasonFormatted))
	// 	.y(d => yScale(d.rank))

	var createLine = d3.svg.line().defined(function (d) {
		return d.rank;
	}).interpolate(INTERPOLATE).x(function (d) {
		return xScale(d.seasonFormatted);
	}).y(function (d) {
		return yScale(d.rank);
	});

	function translate(x, y) {
		return 'translate(' + x + ',' + y + ')';
	}

	function cleanData(data) {
		var yearFormat = d3.time.format('%Y');
		return data.map(function (d, index) {
			d.seasonFormatted = yearFormat.parse(d.seasonYear);
			d.id = index;
			return d;
		});
	}

	function calculateStretch(team) {
		var indices = team.values.map(function (v, i) {
			return v.start || v.stop ? i : -1;
		}).filter(function (v) {
			return v > -1;
		});

		var len = indices.length;
		var newLen = Math.floor(len / 2) * 2;
		var sliced = indices.slice(0, newLen);
		var completed = sliced.map(function (v, i) {
			var streak = i % 2 ? v - sliced[i - 1] : -1;
			return streak;
		}).filter(function (v) {
			return v > 0;
		}).reduce(function (previous, current) {
			return previous.concat(current);
		}, []);

		return { indices: indices, completed: completed };
	}

	function addStretches(values) {
		var active = false;
		return values.map(function (season) {
			var bottom = season.bottom;
			var top = season.top;

			if (bottom && !active) {
				season.start = true;
				season.stretch = true;
				active = true;
			} else if (top && active) {
				season.stop = true;
				season.stretch = true;
				active = false;
			}
			if (active) season.stretch = true;
			return season;
		});
	}

	function getStretches(team) {
		var indices = team.stretches.indices;

		var len = indices.length;
		var newLen = Math.floor(len / 2) * 2;
		var sliced = indices.slice(0, newLen);

		var stretches = sliced.map(function (index, i) {
			var a = index + 1;
			var b = sliced[i - 1];
			return i % 2 ? team.values.slice(b, a) : null;
		}).filter(function (d) {
			return d;
		});

		return stretches;
	}

	function getAverageDiff(count) {
		var diff = count - stretchesMedian;
		if (diff < 2) {
			return 'shorter than';
		} else if (diff > 2) {
			return 'longer than';
		} else {
			return 'about';
		}
	}

	function getStepData(step) {
		switch (step) {
			case 'top-and-bottom':
				{
					return {
						all: [],
						wins: data.filter(function (d) {
							return d.wins;
						}),
						stretches: []
					};
				}

			case 'warriors':
				{
					var team = dataByTeam.filter(function (d) {
						return d.key === 'GSW';
					});
					return {
						all: team,
						wins: team[0].values.filter(function (d) {
							return d.wins;
						}),
						stretches: []
					};
				}

			case 'stretch-single':
				{
					var _team = dataByTeam.filter(function (d) {
						return d.key === singleTeam;
					});
					return {
						all: _team,
						wins: _team[0].values.filter(function (d) {
							return d.wins;
						}),
						stretches: getStretches(_team[0])
					};
				}

			case 'stretch-normalized':
				{}

			case 'stretch-duration':
				{}

			default:
				return {};
		}
	}

	function tweenDash() {
		var l = this.getTotalLength();
		var i = d3.interpolateString('0,' + l, l + ', ' + l);
		return function (t) {
			return i(t);
		};
	}

	function transitionPath(path) {
		path.transition().ease('quad-in-out').duration(SECOND * 3).attrTween('stroke-dasharray', tweenDash);
	}

	function stepGraphic(step) {
		dir = step - previousStep;
		previousStep = step;

		var chartGroup = svg.select('.chart');
		var allGroup = chartGroup.select('.all-group');
		var winsGroup = chartGroup.select('.wins-group');
		var stretchGroup = chartGroup.select('.stretch-group');

		// DATA
		var stepData = getStepData(STEPS[step]);
		var allSelection = allGroup.selectAll('.all').data(stepData.all);
		var winsSelection = winsGroup.selectAll('.wins').data(stepData.wins, function (d) {
			return d.id;
		});
		var stretchSelection = stretchGroup.selectAll('.stretch').data(stepData.stretches);

		console.log(stepData);

		// UPDATE
		switch (STEPS[step]) {
			case 'top-and-bottom':
				{
					winsSelection.enter().append('circle').attr('class', function (d) {
						return 'wins ' + (d.bottom ? 'bottom' : '') + ' ' + (d.top ? 'top' : '');
					}).attr('r', 0).attr('cx', function (d) {
						return xScale(d.seasonFormatted);
					}).attr('cy', function (d) {
						return yScale(d.rank);
					});

					winsSelection.transition().duration(SECOND * 2).delay(function (d) {
						return d.rank * 75 + (dir === 0 ? 0 : EXIT_DURATION);
					}).ease('quad-in-out').attr('r', radiusSmall);
					break;
				}

			case 'warriors':
				{
					allSelection.enter().append('path').attr('class', 'all');

					allSelection.attr('d', function (d) {
						return createLine(d.values);
					}).call(transitionPath);

					winsSelection.enter().append('circle').attr('class', function (d) {
						return 'wins ' + (d.bottom ? 'bottom' : '') + ' ' + (d.top ? 'top' : '');
					}).attr('r', 0).attr('cy', function (d) {
						return yScale(d.rank);
					});

					winsSelection.transition().delay(EXIT_DURATION).duration(SECOND * 2).ease('elastic').attr('r', function (d) {
						return d.bottom || d.top ? radiusLarge : radiusSmall;
					}).attr('cx', function (d) {
						return xScale(d.seasonFormatted);
					}).attr('cy', function (d) {
						return yScale(d.rank);
					});
					break;
				}

			case 'stretch-single':
				{
					allSelection.enter().append('path').attr('class', 'all');

					allSelection.attr('d', function (d) {
						return createLine(d.values);
					});

					stretchSelection.enter().append('path').attr('class', 'stretch');

					stretchSelection.attr('d', function (d) {
						return createLine(d);
					}).call(transitionPath);

					winsSelection.enter().append('circle').attr('class', function (d) {
						return 'wins ' + (d.bottom ? 'bottom' : '') + ' ' + (d.top ? 'top' : '');
					}).attr('r', 0).attr('cy', function (d) {
						return yScale(d.rank);
					});

					winsSelection.transition().delay(dir === 0 ? 0 : EXIT_DURATION).duration(SECOND * 2).ease('elastic').attr('r', function (d) {
						return d.bottom || d.top ? radiusLarge : radiusSmall;
					}).attr('cx', function (d) {
						return xScale(d.seasonFormatted);
					}).attr('cy', function (d) {
						return yScale(d.rank);
					});

					var count = stepData.stretches.length;
					document.querySelector('.madlib-count').innerHTML = count ? 'have made their journey from the bottom to the top <strong class=\'top\'>' + COUNT_TO_WORD[count] + '</strong> time' + (count === 1 ? '' : 's') + ' in franchise history.' : 'have never completed their quest to finish in the top four after starting from the bottom.';

					var recent = count ? stepData.stretches[count - 1].length - 1 : 0;
					document.querySelector('.madlib-detail').innerHTML = count ? 'Their most recent ascent was ' + getAverageDiff(recent) + ' average, spanning <strong class=\'bottom\'>' + recent + '</strong> seasons.' : 'Maybe next year will be their year...';
					break;
				}

			case 'stretch-all':
				{
					break;
				}

			case 'stretch-normalized':
				{
					break;
				}

			case 'stretch-duration':
				{
					break;
				}

			default:
				return {};
		}

		// EXIT
		allSelection.exit().transition().duration(EXIT_DURATION).style('opacity', 0).remove();

		stretchSelection.exit().transition().duration(EXIT_DURATION).style('opacity', 0).remove();

		winsSelection.exit().transition().duration(EXIT_DURATION).style('opacity', 0).remove();
	}

	function updateSingleStep() {
		singleTeam = this.value;
		if (previousStep === 2) stepGraphic(2);
	}

	function setupGraphScroll() {
		var gs = graphScroll().container(d3.select('#container')).graph(d3.select('#graphic')).sections(d3.selectAll('section')).on('active', stepGraphic);
	}

	function handleDataLoaded(err, result) {
		data = cleanData(result);

		var byTeam = d3.nest().key(function (d) {
			return d.name;
		}).entries(data);

		dataByTeam = byTeam.map(function (d) {
			d.values = addStretches(d.values);
			return d;
		}).map(function (d) {
			var _calculateStretch = calculateStretch(d);

			var indices = _calculateStretch.indices;
			var completed = _calculateStretch.completed;

			d.stretches = { indices: indices, completed: completed };
			return d;
		});

		var comp = dataByTeam.reduce(function (previous, current) {
			return previous.concat(current.stretches.completed);
		}, []);
		stretchesMedian = d3.median(comp);
		stretchesCompleted = comp.length;

		// setup chart
		chartWidth = outerWidth - MARGIN.left - MARGIN.right;
		chartHeight = outerHeight - MARGIN.top - MARGIN.bottom;

		// create containers
		svg = d3.select('svg').attr('width', outerWidth).attr('height', outerHeight);

		var chartGroup = svg.append('g').attr('class', 'chart').attr('transform', translate(MARGIN.left, MARGIN.top));

		xScale.domain(d3.extent(data, function (d) {
			return d.seasonFormatted;
		})).range([0, chartWidth]);
		// .nice()
		yScale.domain([1, data.filter(function (d) {
			return d.season === '2015-16';
		}).length + 1])
		// .domain(d3.extent(data, d => d.gamesBack))
		.range([0, chartHeight]);

		// create axis
		var xAxis = d3.svg.axis().scale(xScale).orient('bottom').tickFormat(d3.time.format('‘%y'));

		var yAxis = d3.svg.axis().scale(yScale).orient('left').tickValues([1, 5, 10, 15, 20, 25, 30]);

		chartGroup.append('g').attr('class', 'axis axis--x').attr('transform', translate(0, chartHeight)).call(xAxis);

		chartGroup.append('g').attr('class', 'axis axis--y').attr('transform', translate(0, 0)).call(yAxis);

		chartGroup.append('g').attr('class', 'all-group');

		chartGroup.append('g').attr('class', 'stretch-group');

		chartGroup.append('g').attr('class', 'wins-group');

		setupGraphScroll();
	}

	function createDropdown() {
		var el = document.querySelector('.madlib-name');
		var html = Object.keys(TEAM_NAME_DICT).map(function (key) {
			var selected = key === 'GSW' ? ' selected' : '';
			return '<option' + selected + ' value=\'' + key + '\'>' + TEAM_NAME_DICT[key] + '</option>';
		}).join('\n');
		el.innerHTML = html;

		el.addEventListener('change', updateSingleStep);
	}

	function init() {
		var w = document.getElementById('container').offsetWidth;
		outerWidth = w - SECTION_WIDTH - GRAPHIC_MARGIN;
		outerHeight = Math.round(window.innerHeight - GRAPHIC_MARGIN * 2);
		radiusSmall = Math.max(4, Math.round(outerHeight / 200));
		radiusLarge = Math.round(radiusSmall * 1.5);

		createDropdown();
		d3.json('data/output.json', handleDataLoaded);
	}

	init();
})();

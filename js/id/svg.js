iD.svg = {
    PointTransform: function(projection) {
        return function(entity) {
            // http://jsperf.com/short-array-join
            var pt = projection(entity.loc);
            return 'translate(' + pt[0] + ',' + pt[1] + ')';
        };
    },

    Simplify: function () {
        var line;
        return d3.geo.transform({
            lineStart: function() { line = []; },
            point: function(x, y) { return line.push([x, y]); },
            lineEnd: function() {
                this.stream.lineStart();
                line = simplify(line, 1, false);
                for (var i = 0; i < line.length; ++i)
                    this.stream.point(line[i][0], line[i][1]);
                this.stream.lineEnd();
            }
        });
    },

    Path: function(projection, graph, polygon, simple) {
        var cache = {},
            simplify = iD.svg.Simplify().stream,
            clip = d3.geo.clipExtent().extent(projection.clipExtent()).stream,
            project = projection.stream,
            path = d3.geo.path()
                .projection({stream: function(output) {
                   if (simple) output = simplify(output);
                   return polygon ? project(output) : project(clip(output));
                }});

        return function(entity) {
            if (entity.id in cache) {
                return cache[entity.id];
            } else {
                return cache[entity.id] = path(entity.asGeoJSON(graph));
            }
        };
    },

    OneWaySegments: function(projection, graph, dt) {
        return function(entity) {
            var a,
                b,
                i = 0,
                offset = dt,
                segments = [],
                clip = d3.geo.clipExtent().extent(projection.clipExtent()).stream,
                coordinates = graph.childNodes(entity).map(function(n) {
                    return n.loc;
                });

            if (entity.tags.oneway === '-1') coordinates.reverse();

            d3.geo.stream({
                type: 'LineString',
                coordinates: coordinates
            }, projection.stream(clip({
                lineStart: function() {},
                lineEnd: function() {
                    a = null;
                },
                point: function(x, y) {
                    b = [x, y];

                    if (a) {
                        var span = iD.geo.euclideanDistance(a, b) - offset;

                        if (span >= 0) {
                            var angle = Math.atan2(b[1] - a[1], b[0] - a[0]),
                                dx = dt * Math.cos(angle),
                                dy = dt * Math.sin(angle),
                                p = [a[0] + offset * Math.cos(angle),
                                     a[1] + offset * Math.sin(angle)];

                            var segment = 'M' + a[0] + ',' + a[1] +
                                          'L' + p[0] + ',' + p[1];

                            for (span -= dt; span >= 0; span -= dt) {
                                p[0] += dx;
                                p[1] += dy;
                                segment += 'L' + p[0] + ',' + p[1];
                            }

                            segment += 'L' + b[0] + ',' + b[1];
                            segments.push({id: entity.id, index: i, d: segment});
                        }

                        offset = -span;
                        i++;
                    }

                    a = b;
                }
            })));

            return segments;
        };
    },

    MultipolygonMemberTags: function(graph) {
        return function(entity) {
            var tags = entity.tags;
            graph.parentRelations(entity).forEach(function(relation) {
                if (relation.isMultipolygon()) {
                    tags = _.extend({}, relation.tags, tags);
                }
            });
            return tags;
        };
    }
};

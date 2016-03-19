// main tasks
var gulp = require('gulp');
var serve = require('gulp-serve');
var ghPages = require('gulp-gh-pages');
var runSequence = require('run-sequence');
var watch = require('gulp-watch');
var shell = require('gulp-shell').task;
var sass = require('gulp-sass')
var compass = require('compass-importer');
var sort = require('gulp-sort');

var moment = require("moment");
moment.locale('pl');

gulp.task('serve', ['build', 'watch'], serve('./dist/public'));

gulp.task('clean', function() {
    return gulp.src('dist/**/*')
        .pipe(rm());
});

gulp.task('build', function(done) {
    runSequence('fetch', ['less', 'render', 'assets', 'CNAME'], done);
});

gulp.task('watch', function() {
    watch('app/**/*', function() { 
        runSequence('fetch', 'less', 'render', 'assets');
    });
});

gulp.task('deploy', ['clean', 'build'], function() {
    return gulp.src('./dist/public/**/*')
        .pipe(ghPages({
            remoteUrl: "git@github.com:gamedevpl/www.gamedev.pl.git"
        }));
});

gulp.task('travis-prepare', function(done) {
    if (process.env.TRAVIS_PULL_REQUEST === "false") {
        runSequence("travis-decrypt", "travis-ssh-add", "travis-gitconfig", done);
    } else {
        console.log("Pull request, skipping.")
        done();
    }
});        
gulp.task('travis-decrypt', shell([
    'openssl aes-256-cbc -K $encrypted_6d68858b518f_key -iv $encrypted_6d68858b518f_iv -in .travisdeploykey.enc -out .travisdeploykey -d',     
    'chmod go-rwx .travisdeploykey'
]));
gulp.task('travis-ssh-add', shell('ssh-add .travisdeploykey'));        
gulp.task('travis-gitconfig', shell([     
    'git config --global user.email "gamedevpl@travis-ci.org"',
    'git config --global user.name "Travis-CI"'
]));

// sub tasks
var concat = require('gulp-concat');
var download = require("gulp-download");
var ext_replace = require('gulp-ext-replace');
var jsoncombine = require("gulp-jsoncombine");
var mustache = require("gulp-mustache");
var less = require('gulp-less');
var path = require('path');
var rename = require("gulp-rename");
var rm = require('gulp-rm')

gulp.task('fetch_topics', function() {
    return download("https://forum.gamedev.pl/latest.json?exclude_category_ids=12&page=0")
      .pipe(rename("topics.json"))
      .pipe(gulp.dest('./dist'));
});

gulp.task('fetch_categories', function() {
    return download("https://forum.gamedev.pl/categories.json")
      .pipe(rename("categories.json"))
      .pipe(gulp.dest('./dist'));
});

gulp.task('fetch_highlights', function() {
    return gulp.src("highlights/*.json")
        .pipe(sort({
            asc: false
        }))
        .pipe(jsoncombine("highlights.json", function(data) {
            return new Buffer(JSON.stringify(Object.keys(data).map(function(key) {
                return {
                    key: key,
                    data: data[key]
                }
            })));
         }))
        .pipe(gulp.dest('./dist'));
});

gulp.task('fetch_jobs', function() {
    return download("https://forum.gamedev.pl/latest.json?category=ogloszenia")
      .pipe(rename("jobs.json"))
      .pipe(gulp.dest('./dist'));
});

gulp.task('fetch', ['fetch_topics', 'fetch_highlights', 'fetch_jobs', 'fetch_categories'], function() {
    return gulp.src([
              'dist/topics.json',
              'dist/jobs.json',
              'dist/categories.json',
              'dist/highlights.json'])
         .pipe(jsoncombine("combined.json", function(data) {
             data.jobs.topic_list.topics.forEach(function(topic) {
                topic.date = moment(topic.created_at).calendar();
             });
             data.jobs.category = (data.categories.category_list.categories.filter(category => category.name == 'Ogłoszenia')[0] || {});
             data.topics.topic_list.topics = data.topics.topic_list.topics.filter(function(topic) {
                var category = (data.categories.category_list.categories.filter(category => category.id == topic.category_id)[0] || {});
                topic.categoryName = category.name;
                topic.categoryUrl = 'https://forum.gamedev.pl/c/' + category.slug;
                topic.posters.forEach(poster => {
                    poster.user = data.topics.users.filter(user => user.id == poster.user_id)[0];
                    poster.user.avatarUrl = "http://d2yqgc61pg3yk6.cloudfront.net" + poster.user.avatar_template.replace("{size}", "25");
                });

                return true;//topic.categoryName != "Ogłoszenia";
             }).slice(0, 50);
             return new Buffer(JSON.stringify(data))
          }))
         .pipe(gulp.dest('./dist'));
});

gulp.task('render', function() {
    return gulp.src("app/templates/**/*.mustache")
        .pipe(mustache("./dist/combined.json"))
        .pipe(ext_replace('.html'))
        .pipe(gulp.dest("./dist/public"));    
});

gulp.task('less', function() {
    return gulp.src('app/less/**/*.less')
        .pipe(less({
            paths : [ path.join(__dirname, 'less', 'includes') ]
        }))
        .pipe(gulp.dest('./dist/public/css'));
});

gulp.task('assets-app', function() {
    return gulp.src('app/assets/**/*')
        .pipe(gulp.dest('./dist/public/assets'));
});

gulp.task('assets-highlights', function() {
    return gulp.src(['highlights/*.png', 'highlights/*.jpg'])
        .pipe(gulp.dest('./dist/public/assets/highlights'));
});

gulp.task('assets-js', function() {
    return gulp.src('app/js/**/*')
        .pipe(gulp.dest('./dist/public/js'));
});

gulp.task('assets-font', function() {
    return gulp.src('app/font/**/*')
        .pipe(gulp.dest('./dist/public/font'));
});

gulp.task('assets', ['assets-app', 'assets-js', 'sass', 'assets-font', 'assets-highlights']);

gulp.task('CNAME', function() {
    return gulp.src('CNAME')
        .pipe(gulp.dest('./dist/public'));
});

gulp.task('sass', function() {
    return gulp.src('./app/sass/**/*.scss')
      .pipe(sass({ importer: compass }).on('error', sass.logError))
      .pipe(sass({outputStyle: 'compressed'}))
      .pipe(gulp.dest('./dist/public/css'));
});
 
gulp.task('sass:watch', function () {
  gulp.watch('./app/sass/**/*.scss', ['sass']);
});

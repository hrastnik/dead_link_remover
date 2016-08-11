var http = require('https');
var rawjs = require('raw.js');

var reddit_secret = 'MoEl2axGfSzg9jm3S6DyNWo5xX8';
var reddit_client_id = 'YpmwvUsyqZdMZQ';
var reddit_username = process.argv[2] || (() => {throw 'Provide reddit bot username as first argument'})();
var reddit_password = process.argv[3] || (() => {throw 'Provide reddit bot password as second argument'})();
var reddit_subreddit = process.argv[4] || (() => {throw 'Provide subreddit as third argument'})();
var remove_interval = process.argv[5] || 10*MIN;
var reddit_redirect_uri = 'http://www.google.com';
var reddit = new rawjs('dead-link-remover');

/*
    Check if youtube video with given id is removed. 
    Calls removed_callback if video removed, else calls removed_callback.
*/
function check_if_youtube_video_removed(youtube_video_id, on_valid, on_removed)
{
    var request = http.request(
        {
            host: 'www.youtube.com',
            path: '/watch?v=' + youtube_video_id
        },
        function (response)
        {
            var is_removed = false;
            var page = '';
            
            function has_default_youtube_title(str)
            {
                return str.indexOf('<title>YouTube</title>') !== -1;
            }

            response.on('data', (chunk) => page += chunk);
        
            response.on('end', () => has_default_youtube_title(page) ? on_removed() : on_valid());
        }
    );

    request.on('error', error => console.log('Youtube request failed:\n' + error));

    request.end();
}

/*
    Gets latest posts from reddit 
    Callback parameter is reddit listing object with posts in object.data.children array  
*/
function get_latest_posts(subreddit_name, received_posts_callback)
{
    var request = http.request(
        {
            host : 'www.reddit.com',
            path : '/r/' + subreddit_name + '/new.json',
            method : 'GET'
        },
        function (response)
        {
            var page_string = ''; 
            response.on('data', chunk => page_string += chunk);
            response.on('end', () => received_posts_callback(JSON.parse(page_string)));
        }
    );

    request.on('error', error => console.log('Getting reddit posts failed:\n' + error));

    request.end();
}

/*
    Log in to reddit and calls on_login_success with parameter returned by reddit
*/
function reddit_login(on_login_success)
{
    reddit.auth(
        {
            'username' : reddit_username,
            'password' : reddit_password
        }, 
        function (err, res)
        {
            if (err) console.log('Error' + err);
            else on_login_success();
        }
    );
}

function remove_reddit_post(post_id)
{
    reddit.remove(post_id, (err) => err && console.log('Error from remove('+post_id+'): ' + err));
}

function check_if_post_is_youtube_link(post, on_true)
{
    if (post.data.domain === 'youtu.be')
    {
        var tmp = post.data.url.split('youtu.be/');
        var video_id = tmp[tmp.length - 1].substr(0, 11);
        on_true(video_id);
    }
    else if (post.data.domain === 'youtube.com')
    {
        var tmp = post.data.url.split('watch?v=');
        var video_id = tmp[tmp.length - 1].substr(0, 11);
        on_true(video_id);
    }
}

function main_loop()
{
    reddit.setupOAuth2(reddit_client_id, reddit_secret, reddit_redirect_uri);

    get_latest_posts(reddit_subreddit, function(json_posts)
    {
        if (json_posts.kind != 'Listing')
        {
            console.log("Error getting Reddit posts");
            return;
        }

        json_posts.data.children.forEach((post) =>
        {
            if (post.kind !== 't3')
            {
                console.log('Reddit post with id ' + post.data.id + ' is not a link'); 
                return;
            }
        
            check_if_post_is_youtube_link(post, function on_true(video_id) 
            {
                check_if_youtube_video_removed(
                    video_id, 
                    function on_not_removed() 
                    {
                        console.log('Post ' + post.data.id + ' : Youtube ID '+ video_id +' is not removed.')
                    },
                    function on_removed()
                    {
                        console.log('Trying to remove post ' + post.data.id + ' with Youtube ID ' + video_id)
                        reddit_login(() => 
                        {
                            remove_reddit_post(post.data.name)
                        });
                    }
                );
            });
        });
    });    
}

var SEC = 1000;
var MIN = 60 * SEC;

setInterval(main_loop, remove_interval);

// Bind to port ... Heroku times out if you don't
http.createServer((req, res) => 
{
    res.statusCode = '200'; 
    res.setHeader('Content-Type', 'text/plain'); 
    res.end('Remover working...');
}).listen(process.PORT || 8080);

console.log('Dead link remover successfully started');